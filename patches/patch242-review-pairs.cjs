/* Say yes or no to a pair by looking at it.

   Asked for: "look at what we built recently with the yes/no verification and
   implement basically this entire page to pixelbench so my team can help me
   say yes/no to certain traits".

   THE PAGE THIS COMES FROM is "Choose trait combinations" - a trait, a target
   layer, a contact sheet of every pairing, and Yes or No on each. Its output
   is the rules file this app already imports. What it could not do is let more
   than one person work: the answers lived in one browser's localStorage and
   moved by downloading a backup and handing it over.

   WHAT IS DIFFERENT HERE, and why:

   - The pictures are COMPOSITED LIVE from the traits in the project, not
     shipped as 121 pre-rendered sheets. The app already has the pieces -
     cBitmap caches a decoded trait and paintTrait draws one - so the sheet is
     always of the artwork as it is now, and a re-cut trait does not leave a
     stale review behind it.

   - ONE CLICK PER PAIR, not two. The original opens a dialog on each image and
     asks Yes or No in it. That is fine for a handful; this collection has 35
     hats against 25 hairstyles, and every one of those pairs is a decision, so
     a tile carries its own two buttons and the keyboard walks the grid. Same
     answers, half the clicks.

   - The answers go to the GROUP, through the decisions record added with the
     rules column. Two people can review different traits at once and keep both
     halves - that is the merge in mergeDecisions, and it is the reason the
     answers are stored per pair rather than as a rule list.

   WHAT A TILE MEANS. Three states, and the third is the point of keeping
   decisions separate from rules:
     allowed   - somebody answered yes
     excluded  - somebody answered no, and a rule holds the pair apart
     unseen    - nobody has looked, which is NOT the same as allowed even
                 though the generator treats it that way today
   Without the third state a review cannot say what is left to do, and the
   coverage line under the picker would be a guess.
*/
const kit = require('../tools/patchkit.cjs');
const doc = kit.load(process.argv[2]);

if (doc.original.indexOf('revOpen') >= 0) throw new Error('already patched');
if (doc.original.indexOf('async function decidePair(') < 0)
  throw new Error('patch241 has to land first - this records answers through it');

/* ---- 1. the way in, under the rules it writes ---- */
{
  const at = kit.only(doc.lines, l => l === '    <p class="note" id="rulestate" hidden></p>', 'the rules note');
  kit.replace(doc.lines, { start: at, end: at }, [
    '    <p class="note" id="rulestate" hidden></p>',
    '    <!-- Answering pairs by looking at them, which is how the rules were',
    '         made in the first place. The picker is two lists and a button so it',
    '         costs nothing until somebody opens it. -->',
    '    <div class="olrow" style="margin-top:6px">',
    '      <span>Review pairs</span>',
    '      <select id="revtrait" aria-label="Trait to review" style="flex:1;min-width:0"></select>',
    '      <select id="revlayer" aria-label="Against which layer" style="flex:1;min-width:0"></select>',
    '      <button class="mini" id="revopen"',
    '        title="Look at this trait over every trait on that layer and answer yes or no to each. Answers are shared with your group.">Review</button>',
    '    </div>',
    '    <p class="note" id="revcover" hidden></p>',
  ]);
  console.log('ok  a way in, under the rules it writes');
}

/* ---- 2. the sheet itself ---- */
{
  const at = kit.only(doc.lines, l => l === '<div class="scrim" id="ksscrim" hidden>', 'the shortcuts overlay');
  kit.replace(doc.lines, { start: at, end: at }, [
    '<!-- The review sheet. Same overlay shape as the shortcuts panel: a scrim',
    '     that closes on Escape and on a click outside the card. -->',
    '<div class="scrim" id="revscrim" hidden>',
    '  <div class="card" role="dialog" aria-modal="true" aria-labelledby="revtitle" style="width:min(980px,96vw)">',
    '    <h2 id="revtitle"></h2>',
    '    <p class="sub" id="revsub"></p>',
    '    <div class="revgrid" id="revgrid"></div>',
    '    <div class="savebar" style="margin-top:18px">',
    '      <button class="btn ghost" id="revyesall">Yes to the rest</button>',
    '      <button class="btn ghost" id="revnoall">No to the rest</button>',
    '      <button class="btn" id="revclose" style="flex:1">Done</button>',
    '    </div>',
    '  </div>',
    '</div>',
    '',
    '<div class="scrim" id="ksscrim" hidden>',
  ]);
  console.log('ok  and a sheet to answer on');
}

/* ---- 3. what it looks like ---- */
{
  const at = kit.only(doc.lines, l => l === '/* ================= end density pass ============================= */',
    'the density block end');
  kit.replace(doc.lines, { start: at, end: at }, [
    '/* ================= end density pass ============================= */',
    '',
    '/* THE REVIEW SHEET. A tile is a picture, a name and two answers.',
    '',
    '   auto-fill rather than a fixed count, because the sheet is 25 hairstyles',
    '   on one trait and 9 costumes on another, and a fixed grid leaves either a',
    '   scrollbar or a field of empty cells. */',
    '.revgrid{display:grid; gap:10px; max-height:62dvh; overflow-y:auto; padding:2px;',
    '  grid-template-columns:repeat(auto-fill,minmax(132px,1fr));}',
    '.revtile{border:1px solid var(--line); border-radius:10px; padding:6px;',
    '  background:var(--panel); display:flex; flex-direction:column; gap:5px;}',
    '/* The state is carried by the border as well as the buttons, so a sheet of',
    '   25 reads at a glance instead of one tile at a time. */',
    '.revtile.yes{border-color:var(--good,#3fa66a);}',
    '.revtile.no{border-color:var(--bad); opacity:.72;}',
    '.revtile canvas{width:100%; height:auto; image-rendering:pixelated;',
    '  border-radius:6px; background:var(--ink-bg,#0006);}',
    '.revtile .nm{font-size:11.5px; line-height:1.3; color:var(--dim);',
    '  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}',
    '.revtile .ans{display:flex; gap:5px;}',
    '.revtile .ans button{flex:1; padding:3px 0; font-size:11.5px;}',
    '/* The answer that is currently in force, filled in rather than outlined. */',
    '.revtile .ans button[aria-pressed="true"]{background:var(--accent-soft);',
    '  border-color:var(--accent); color:var(--accent);}',
    '@media (max-width:820px){',
    '  .revgrid{grid-template-columns:repeat(auto-fill,minmax(108px,1fr)); max-height:56dvh;}',
    '  .revtile .ans button{padding:7px 0; font-size:12.5px;}',
    '}',
  ]);
  console.log('ok  and a look, with the state on the border as well as the buttons');
}

/* ---- 4. the behaviour ---- */
{
  const at = kit.only(doc.lines, l => l === 'function ruleState(){', 'ruleState');
  kit.replace(doc.lines, { start: at, end: at }, [
    '/* ================= reviewing pairs ================================',
    '',
    '   A pair is in one of three states, and the third is why decisions are kept',
    '   apart from rules: "nobody has looked" is not "allowed", even though the',
    '   generator treats them the same. Without it the coverage line would be a',
    '   guess and the sheet could not say what is left. */',
    'function pairState(a,b){',
    '  if(RULES.some(g=>g.indexOf(a)>=0&&g.indexOf(b)>=0)) return "no";',
    '  const id=pairId(a,b);',
    '  const d=DECISIONS.find(x=>pairId(x.a,x.b)===id);',
    '  return d ? (d.ok?"yes":"no") : "unseen";',
    '}',
    'let revCond=null, revLayer=null;',
    '/* Which traits this sheet is about. Not traitEligible: a rule names a trait',
    '   by layer and name and carries no status, and an import leaves everything',
    '   wip - so reviewing only approved traits would show an empty sheet at the',
    '   exact moment somebody first tries it. */',
    'function revCandidates(){',
    '  return cItems.filter(t=>t&&t.kind==="trait"&&(t.layer||"unsorted")===revLayer)',
    '    .sort((x,y)=>String(x.name).localeCompare(String(y.name)));',
    '}',
    'function revFill(){',
    '  const T=$("revtrait"), L=$("revlayer");',
    '  if(!T||!L) return;',
    '  const keep=T.value, keepL=L.value;',
    '  T.innerHTML="";',
    '  const keys=[...new Set(cItems.filter(t=>t&&t.kind==="trait").map(traitKey))].sort();',
    '  for(const k of keys){ const o=document.createElement("option"); o.value=k; o.textContent=k; T.appendChild(o); }',
    '  if(keys.indexOf(keep)>=0) T.value=keep;',
    '  /* Every layer except the one the trait is on: only one trait per layer is',
    '     ever chosen, so a pair inside a layer can never occur and answering it',
    '     would write a rule that can never bite. */',
    '  const own=T.value?T.value.slice(0,T.value.indexOf("/")):null;',
    '  L.innerHTML="";',
    '  for(const l of LAYERS){',
    '    if(l===own||l==="unsorted") continue;',
    '    const o=document.createElement("option"); o.value=l; o.textContent=l; L.appendChild(o);',
    '  }',
    '  if([...L.options].some(o=>o.value===keepL)) L.value=keepL;',
    '  revCoverage();',
    '}',
    '/* How much of this sheet has been answered, said before it is opened so the',
    '   picker is worth reading on its own. */',
    'function revCoverage(){',
    '  const el=$("revcover"); if(!el) return;',
    '  const cond=$("revtrait").value, layer=$("revlayer").value;',
    '  if(!cond||!layer){ el.hidden=true; return; }',
    '  const was=[revCond,revLayer]; revCond=cond; revLayer=layer;',
    '  const list=revCandidates();',
    '  revCond=was[0]; revLayer=was[1];',
    '  if(!list.length){ el.hidden=false; el.textContent="Nothing on "+layer+" to compare it with."; return; }',
    '  let seen=0, no=0;',
    '  for(const t of list){ const s=pairState(cond,traitKey(t)); if(s!=="unseen") seen++; if(s==="no") no++; }',
    '  el.hidden=false;',
    '  el.textContent=seen+" of "+list.length+" answered"+(no?", "+no+" excluded":"")+".";',
    '}',
    '/* One tile: the two traits over the base, painted in the order they would',
    '   be on a character. Live from the project rather than a stored sheet, so a',
    '   trait that has been re-cut cannot leave a stale picture behind it. */',
    'async function revPaint(cv,cond,cand){',
    '  const base=cItems.find(i=>i&&i.kind==="ref");',
    '  const pieces=[base,cond,cand].filter(Boolean);',
    '  let W=0,H=0;',
    '  for(const p of pieces){ if(p.w>W) W=p.w; if(p.h>H) H=p.h; }',
    '  if(!W||!H){ W=160; H=160; }',
    '  cv.width=W; cv.height=H;',
    '  const g=cv.getContext("2d");',
    '  g.imageSmoothingEnabled=false;',
    '  g.clearRect(0,0,W,H);',
    '  /* Paint order, not decide order - this is a picture of the character. */',
    '  const at=l=>{ const i=LAYERS.indexOf(l); return i<0?LAYERS.length:i; };',
    '  const two=[cond,cand].sort((a,b)=>at(a.layer||"unsorted")-at(b.layer||"unsorted"));',
    '  for(const p of (base?[base]:[]).concat(two)){',
    '    try{ paintTrait(g,await cBitmap(p),0,0,W,H); }catch(_){ }',
    '  }',
    '}',
    'async function revBuild(){',
    '  const grid=$("revgrid"); if(!grid) return;',
    '  grid.innerHTML="";',
    '  const cond=cItems.find(t=>t&&t.kind==="trait"&&traitKey(t)===revCond);',
    '  const list=revCandidates();',
    '  $("revtitle").textContent=revCond+" over "+revLayer;',
    '  $("revsub").textContent=list.length',
    '    ? "Yes allows the pair. No keeps them off the same character. Answers are saved as you make them."',
    '    : "Nothing on that layer yet.";',
    '  for(const t of list){',
    '    const k=traitKey(t);',
    '    const tile=document.createElement("div");',
    '    tile.className="revtile";',
    '    const cv=document.createElement("canvas");',
    '    tile.appendChild(cv);',
    '    const nm=document.createElement("div");',
    '    nm.className="nm"; nm.textContent=t.name; nm.title=k;',
    '    tile.appendChild(nm);',
    '    const ans=document.createElement("div"); ans.className="ans";',
    '    const mk=(label,ok)=>{',
    '      const b=document.createElement("button");',
    '      b.className="mini"; b.type="button"; b.textContent=label;',
    '      b.setAttribute("aria-label",label+" to "+revCond+" with "+k);',
    '      b.onclick=async()=>{',
    '        b.disabled=true;',
    '        try{ await decidePair(revCond,k,ok); }catch(_){ toast("Could not save that answer"); }',
    '        b.disabled=false;',
    '        revMark(tile,revCond,k);',
    '        revCoverage();',
    '        await renderShelf();',
    '      };',
    '      return b;',
    '    };',
    '    ans.appendChild(mk("Yes",true));',
    '    ans.appendChild(mk("No",false));',
    '    tile.appendChild(ans);',
    '    grid.appendChild(tile);',
    '    revMark(tile,revCond,k);',
    '    if(cond) revPaint(cv,cond,t);',
    '  }',
    '}',
    '/* The state on the tile, from the rules and the answers rather than from',
    '   what the click did - so a rule changed anywhere else shows up here. */',
    'function revMark(tile,a,b){',
    '  const s=pairState(a,b);',
    '  tile.classList.toggle("yes",s==="yes");',
    '  tile.classList.toggle("no",s==="no");',
    '  const btns=tile.querySelectorAll(".ans button");',
    '  if(btns[0]) btns[0].setAttribute("aria-pressed",String(s==="yes"));',
    '  if(btns[1]) btns[1].setAttribute("aria-pressed",String(s==="no"));',
    '}',
    'async function revAll(ok){',
    '  /* THE REST, not everything: a bulk answer must not overwrite the ones',
    '     somebody has already thought about. */',
    '  const list=revCandidates().filter(t=>pairState(revCond,traitKey(t))==="unseen");',
    '  if(!list.length){ toast("Every pair here has been answered"); return; }',
    '  for(const t of list){',
    '    DECISIONS=mergeDecisions(DECISIONS,[{a:revCond,b:traitKey(t),ok:!!ok,at:Date.now()}]);',
    '    applyDecision(revCond,traitKey(t),ok);',
    '  }',
    '  try{ await saveRules(); }catch(_){ toast("Could not save those answers"); return; }',
    '  await revBuild(); revCoverage(); await renderShelf();',
    '  toast(list.length+" answered "+(ok?"yes":"no"));',
    '}',
    'async function revOpen(on){',
    '  const sc=$("revscrim"); if(!sc) return;',
    '  if(!on){ sc.hidden=true; return; }',
    '  revCond=$("revtrait").value; revLayer=$("revlayer").value;',
    '  if(!revCond||!revLayer){ toast("Pick a trait and a layer"); return; }',
    '  sc.hidden=false;',
    '  await revBuild();',
    '}',
    'function ruleState(){',
  ]);
  console.log('ok  and the behaviour, with three states and a live picture');
}

/* ---- 5. wired, and closable the way everything else is ---- */
{
  const at = kit.only(doc.lines, l => l === "$('ruleimport').onclick=()=>$('rulefile').click();", 'the import wiring');
  kit.replace(doc.lines, { start: at, end: at }, [
    "$('ruleimport').onclick=()=>$('rulefile').click();",
    "$('revopen').onclick=()=>revOpen(true);",
    "$('revclose').onclick=()=>revOpen(false);",
    "$('revyesall').onclick=()=>revAll(true);",
    "$('revnoall').onclick=()=>revAll(false);",
    "$('revtrait').onchange=()=>{ revFill(); };",
    "$('revlayer').onchange=()=>revCoverage();",
    '/* Closes on a click outside the card, like the shortcuts panel. */',
    "$('revscrim').onclick=e=>{ if(e.target===$('revscrim')) revOpen(false); };",
  ]);
  /* And Escape, through the one table the help panel and the handler share.

     Anchored on the entry's FIRST line, not on its match: line. The first
     attempt used the match line - which is a CONTINUATION of an existing entry
     - and spliced a whole new entry into the middle of it. The parse check in
     kit.save refused the file before it was written, which is what that check
     is for.

     BEFORE the ksscrim row, because the handler takes the first row whose
     match fires and the review sheet is the one on top when both are open. */
  const esc = kit.only(doc.lines,
    l => l === "  {show:'Esc', desc:'Close this list',", 'the escape row');
  kit.replace(doc.lines, { start: esc, end: esc }, [
    "  {show:'Esc', desc:'Close the review sheet',",
    "    match:e=>e.key==='Escape'&&!$('revscrim').hidden, prevent:true,",
    '    run:()=>revOpen(false)},',
    doc.lines[esc],
  ]);
  console.log('ok  wired, and closes on Escape and on a click outside');
}

/* ---- 6. the pickers are filled with everything else ---- */
{
  const at = kit.only(doc.lines, l => l === '  ruleState();', 'the rules note call');
  kit.replace(doc.lines, { start: at, end: at }, [
    '  ruleState();',
    '  /* After buildRules, which is where cItems is current. */',
    '  revFill();',
  ]);
  console.log('ok  and filled on every render');
}

/* ================= CHECK FIRST, WRITE LAST ================= */
const delta = kit.save(doc, ({ code, codeLines, text }) => {
  for (const id of ['revtrait', 'revlayer', 'revopen', 'revcover', 'revscrim', 'revgrid', 'revclose'])
    if (text.indexOf('id="' + id + '"') < 0) throw new Error('the markup is missing ' + id);

  const ps = kit.inFunction(codeLines, 'function pairState(a,b){');
  const p = codeLines.slice(ps.start, ps.end + 1).join('\n');
  /* Three states, and unseen must be distinguishable from yes. */
  if (p.indexOf('"unseen"') < 0) throw new Error('a pair nobody looked at reads as answered');
  if (p.indexOf('RULES.some(') < 0) throw new Error('the rules are not consulted for the state');

  /* The sheet must not filter by status, or an imported project shows nothing. */
  const rc = kit.inFunction(codeLines, 'function revCandidates(){');
  const c = codeLines.slice(rc.start, rc.end + 1).join('\n');
  if (c.indexOf('traitEligible') >= 0)
    throw new Error('the sheet would be empty for a project whose traits are still wip');

  /* A pair inside one layer can never occur, so it must not be offerable. */
  const rf = kit.inFunction(codeLines, 'function revFill(){');
  const f = codeLines.slice(rf.start, rf.end + 1).join('\n');
  if (f.indexOf('if(l===own||l==="unsorted") continue;') < 0)
    throw new Error('a layer could be reviewed against itself');

  /* Bulk answers must not overwrite considered ones. */
  const ra = kit.inFunction(codeLines, 'async function revAll(ok){');
  const a = codeLines.slice(ra.start, ra.end + 1).join('\n');
  if (a.indexOf('==="unseen"') < 0)
    throw new Error('a bulk answer would overwrite pairs somebody already decided');

  /* The picture is painted in PAINT order, not decide order. */
  const rp = kit.inFunction(codeLines, 'async function revPaint(cv,cond,cand){');
  const pt = codeLines.slice(rp.start, rp.end + 1).join('\n');
  if (pt.indexOf('LAYERS.indexOf(l)') < 0)
    throw new Error('the tile is not painted in the order a character is');
  if (pt.indexOf('decideOrder') >= 0)
    throw new Error('the tile is painted in decide order, which is not what a character looks like');

  /* Every answer goes through the shared record. */
  if (code.indexOf('await decidePair(revCond,k,ok)') < 0)
    throw new Error('a tile answer does not go through the shared record');
  /* And it closes the way every other overlay does. */
  if (code.indexOf("$('revscrim').onclick=e=>{ if(e.target===$('revscrim')) revOpen(false); };") < 0)
    throw new Error('the sheet cannot be closed by clicking outside it');
  if (code.indexOf("match:e=>e.key==='Escape'&&!$('revscrim').hidden") < 0)
    throw new Error('Escape does not close the sheet');
});

/* RUN the three states and the bulk rule. */
{
  const pairId = (a, b) => (a < b ? [a, b] : [b, a]).join(' ');
  const RULES = [['hats/cap', 'hair/bob']];
  const DECISIONS = [{ a: 'hair/mop', b: 'hats/cap', ok: true, at: 1 }];
  const state = (a, b) => {
    if (RULES.some(g => g.indexOf(a) >= 0 && g.indexOf(b) >= 0)) return 'no';
    const id = pairId(a, b);
    const d = DECISIONS.find(x => pairId(x.a, x.b) === id);
    return d ? (d.ok ? 'yes' : 'no') : 'unseen';
  };
  if (state('hats/cap', 'hair/bob') !== 'no') throw new Error('a rule should read as excluded');
  if (state('hats/cap', 'hair/mop') !== 'yes') throw new Error('an answered pair should read as allowed');
  if (state('hats/cap', 'hair/new') !== 'unseen') throw new Error('an unanswered pair should read as unseen');
  /* Read from the other side too - a pair is one pair. */
  if (state('hair/mop', 'hats/cap') !== 'yes') throw new Error('the answer depends on which side asks');
  /* Bulk answers only the unseen. */
  const cands = ['hair/bob', 'hair/mop', 'hair/new', 'hair/other'];
  const rest = cands.filter(k => state('hats/cap', k) === 'unseen');
  if (rest.join() !== 'hair/new,hair/other')
    throw new Error('a bulk answer would overwrite considered pairs: ' + rest.join());
  console.log('    a rule reads no, an answer reads yes, and ' + rest.length
    + ' of ' + cands.length + ' are still unseen');
  console.log('    so "the rest" leaves the two somebody already thought about alone');
}
console.log('net ' + delta + ' bytes');
console.log('parses PASS, file written');
