/* THE FINAL REVIEW PASS, one trait at a time.

   The queue is loaded and the ids are stamped; this is the part somebody
   actually uses. On the project page, above the shelf, because that is where
   the traits are and the pass is about them.

   ONE TRAIT, ITS PLACE IN THE QUEUE, AND THE TWO ANSWERS IT NEEDS. The handoff
   asks for artwork review and naming review tracked SEPARATELY - a picture can
   be right under the wrong name and the reverse - so they are two buttons and
   two states, not one "approved".

   THE NAME IS EDITED HERE AND APPLIED BY THE EXISTING RENAME. Accepting a name
   that differs from the trait's own runs the same saveTrait path a rename in
   the editor runs, which already rewrites the id, moves the server row,
   retargets the rules and - since this morning - carries the reviewed answers
   and the queue id with it. Nothing new gets to move a trait.

   AND IT RESUMES. activeId is written on every move, so closing the tab and
   coming back opens the trait that was open, which for 317 of them is the
   difference between a pass and starting again. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. the panel ------------------------------------------------------ */
swap(block([
  '  <!-- The trait parameters. They lived inside Build a character, under the',
]), block([
  '  <!-- The final review pass. On the project page and above the shelf: it is',
  '       about the traits, and it is the thing being done when it is running. -->',
  '  <section class="proj pg-project" id="review" hidden>',
  '    <div class="projhead">',
  '      <h2>Final review</h2>',
  '      <span class="count" id="reviewcount"></span>',
  '      <div class="acts">',
  '        <button class="mini" id="reviewload">Load a review queue</button>',
  '      </div>',
  '    </div>',
  '    <p class="note" id="reviewnote" hidden></p>',
  '    <input type="file" id="reviewfile" accept="application/json,.json" hidden>',
  '    <div id="reviewbody" hidden>',
  '      <div class="revnow">',
  '        <canvas id="revshot" width="8" height="8"></canvas>',
  '        <div class="revmeta">',
  '          <b id="revwhere"></b>',
  '          <span class="note" id="revwas"></span>',
  '          <div class="olrow" style="margin-top:6px">',
  '            <label for="revname">Name</label>',
  '            <input id="revname" type="text" style="flex:1;min-width:0" aria-label="Final name">',
  '          </div>',
  '        </div>',
  '      </div>',
  '      <div class="olrow" style="margin-top:8px">',
  '        <button class="mini" id="revprev">Previous</button>',
  '        <button class="mini" id="revopen2">Open in the editor</button>',
  '        <button class="mini" id="revart">Artwork is right</button>',
  '        <button class="mini" id="revnamed">Name is right</button>',
  '        <button class="mini" id="revskip">Skip</button>',
  '        <button class="mini" id="revnext">Next</button>',
  '      </div>',
  '    </div>',
  '  </section>',
  '  <!-- The trait parameters. They lived inside Build a character, under the',
]));

swap('.draftbar{display:flex; gap:10px; align-items:center; flex-wrap:wrap;', block([
  '.revnow{display:flex; gap:12px; align-items:flex-start;}',
  '.revnow canvas{width:88px; height:88px; flex:none; border-radius:8px;',
  '  background:var(--panel); image-rendering:pixelated; object-fit:contain;',
  '  border:1px solid var(--line);}',
  '.revmeta{flex:1; min-width:0;}',
  '.revmeta b{display:block; font-size:13.5px;}',
  '.revdone{color:var(--accent);}',
  '.draftbar{display:flex; gap:10px; align-items:center; flex-wrap:wrap;',
]));

/* ---- 2. drawing it ----------------------------------------------------- */
swap(block([
  '/* ---- the section ------------------------------------------------- */',
]), block([
  '/* WHERE THE PASS IS, and what the trait in front of you still needs.',
  '',
  '   Reads REVIEW for the queue and the store for the picture, so a trait',
  '   renamed since the queue was seeded still draws: it is found by the id',
  '   stamped on it, not by the name the queue remembers. */',
  'function reviewIndex(){',
  '  if(!REVIEW) return -1;',
  '  const i=REVIEW.entries.findIndex(e=>e.id===REVIEW.activeId);',
  '  return i<0?0:i;',
  '}',
  'async function traitForEntry(e){',
  '  if(!e) return null;',
  '  let items=[]; try{ items=(await dbAll()).filter(i=>i.kind==="trait"); }catch(_){ return null; }',
  '  return items.find(t=>t.reviewId===e.id)',
  '    || items.find(t=>(t.layer||"")===e.layer && t.name===reviewBase(e.currentName))',
  '    || null;',
  '}',
  'async function renderReview(){',
  '  const sec=$("review"); if(!sec) return;',
  '  const body=$("reviewbody"), count=$("reviewcount");',
  '  sec.hidden=false;',
  '  if(!REVIEW){',
  '    body.hidden=true;',
  '    count.textContent="not started";',
  '    return;',
  '  }',
  '  body.hidden=false;',
  '  const done=REVIEW.entries.filter(e=>e.artworkAccepted&&e.nameAccepted).length;',
  '  const i=reviewIndex(), e=REVIEW.entries[i];',
  '  count.textContent=(i+1)+" of "+REVIEW.entries.length+", "+done+" finished";',
  '  $("revwhere").textContent=e.layer+" \\u2014 "+reviewBase(e.currentName);',
  '  const t=await traitForEntry(e);',
  '  /* SAID, not guessed at. A queue entry with no trait here cannot be',
  '     reviewed, and drawing an empty box without saying why is how somebody',
  '     concludes the tool is broken. */',
  '  const marks=[];',
  '  marks.push(e.artworkAccepted?"artwork \\u2713":"artwork pending");',
  '  marks.push(e.nameAccepted?"name \\u2713":"name pending");',
  '  if(e.skipped) marks.push("skipped");',
  '  if(!t) marks.push("not in this project");',
  '  $("revwas").textContent=marks.join(" \\u00b7 ")',
  '    +(reviewBase(e.originalName)!==reviewBase(e.currentName)',
  '      ? " \\u00b7 was "+reviewBase(e.originalName) : "");',
  '  $("revwas").className="note"+((e.artworkAccepted&&e.nameAccepted)?" revdone":"");',
  '  const nameBox=$("revname");',
  '  if(document.activeElement!==nameBox)',
  '    nameBox.value=e.finalName||reviewBase(t?t.name:e.currentName);',
  '  const cv=$("revshot");',
  '  cv.width=t?Math.max(1,t.w||1):8; cv.height=t?Math.max(1,t.h||1):8;',
  '  const g=cv.getContext("2d"); g.clearRect(0,0,cv.width,cv.height);',
  '  if(t&&t.blob) createImageBitmap(t.blob).then(bm=>{',
  '    g.imageSmoothingEnabled=false; g.drawImage(bm,0,0);',
  '  }).catch(()=>{});',
  '  $("revopen2").disabled=!t;',
  '}',
  '/* Moving through the queue. Written down on every step, so closing the tab',
  '   and coming back opens the trait that was open - which over 317 of them is',
  '   the difference between a pass and starting again. */',
  'async function reviewGo(delta){',
  '  if(!REVIEW) return;',
  '  const i=reviewIndex();',
  '  const n=Math.max(0,Math.min(REVIEW.entries.length-1,i+delta));',
  '  REVIEW.activeId=REVIEW.entries[n].id;',
  '  await saveReview();',
  '  await renderReview();',
  '}',
  '/* ---- the section ------------------------------------------------- */',
]));

/* ---- 3. shown with the project ---------------------------------------- */
swap(block([
  "  $('rules').hidden=false;",
]), block([
  "  $('rules').hidden=false;",
  '  /* Beside the rules, and for the same reason: both are about the collection',
  '     rather than one trait, and both are meaningless with nothing in it. */',
  '  renderReview();',
]));

swap(block([
  "  try{ items=await dbAll(); }catch(_){ $('proj').hidden=true; $('compose').hidden=true;",
  "    $('layers').hidden=true; $('rules').hidden=true; $('recent').hidden=true; return; }",
]), block([
  "  try{ items=await dbAll(); }catch(_){ $('proj').hidden=true; $('compose').hidden=true;",
  "    $('layers').hidden=true; $('rules').hidden=true; $('recent').hidden=true;",
  "    $('review').hidden=true; return; }",
]));

/* ---- 4. the controls --------------------------------------------------- */
swap("$('ruleclear').onclick=clearRules;", block([
  "$('ruleclear').onclick=clearRules;",
  "$('reviewload').onclick=()=>$('reviewfile').click();",
  "$('reviewfile').onchange=async e=>{",
  "  const f=e.target.files&&e.target.files[0];",
  "  /* Cleared so choosing the same file twice fires again. */",
  "  e.target.value='';",
  "  if(f){ await importReviewQueue(f); await renderReview(); }",
  "};",
  "$('revprev').onclick=()=>reviewGo(-1);",
  "$('revnext').onclick=()=>reviewGo(1);",
  "$('revskip').onclick=async()=>{",
  "  if(!REVIEW) return;",
  "  REVIEW.entries[reviewIndex()].skipped=true;",
  "  await saveReview();",
  "  await reviewGo(1);",
  "};",
  "/* Opening goes through the same path the shelf uses, so the trait arrives",
  "   with its draft, its measured block and its brush exactly as it would from",
  "   anywhere else. */",
  "$('revopen2').onclick=async()=>{",
  "  if(!REVIEW) return;",
  "  const t=await traitForEntry(REVIEW.entries[reviewIndex()]);",
  "  if(!t){ toast('That trait is not in this project'); return; }",
  "  if(!await openTraitRecord(t)) toast('Could not open '+t.name);",
  "};",
  "$('revart').onclick=async()=>{",
  "  if(!REVIEW) return;",
  "  const e=REVIEW.entries[reviewIndex()];",
  "  e.artworkAccepted=!e.artworkAccepted;",
  "  await saveReview(); await renderReview();",
  "};",
  "/* ACCEPTING A NAME THAT CHANGED IS A RENAME, and it goes through saveTrait -",
  "   the one path that rewrites the id, moves the server row, retargets the",
  "   rules and carries the answers and the queue id across. Nothing here gets",
  "   its own way of moving a trait. */",
  "$('revnamed').onclick=async()=>{",
  "  if(!REVIEW) return;",
  "  const e=REVIEW.entries[reviewIndex()];",
  "  const want=String($('revname').value||'').trim();",
  "  if(!want){ toast('Give it a name first'); return; }",
  "  const t=await traitForEntry(e);",
  "  if(t && want!==t.name){",
  "    const opened=await openTraitRecord(t);",
  "    if(!opened){ toast('Could not open '+t.name); return; }",
  "    $('tname').value=want;",
  "    const ok=await saveTrait();",
  "    if(ok===false) return;   /* saveTrait already said why */",
  "    closeEditor();",
  "  }",
  "  e.finalName=want; e.currentName=want+'.png'; e.nameAccepted=true;",
  "  await saveReview();",
  "  await renderShelf();",
  "  await renderReview();",
  "};",
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['async function renderReview(){', 'async function reviewGo(delta){',
  'async function traitForEntry(e){', "$('revnext').onclick=()=>reviewGo(1);",
  "$('reviewload').onclick=()=>$('reviewfile').click();"])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
for (const id of ['review', 'reviewcount', 'reviewload', 'reviewfile', 'reviewnote',
  'reviewbody', 'revshot', 'revwhere', 'revwas', 'revname', 'revprev',
  'revopen2', 'revart', 'revnamed', 'revskip', 'revnext'])
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error('id not in the markup exactly once: ' + id);

/* THE EXISTING REVIEW PAIRS BUTTON IS UNTOUCHED. It is #revopen; the new one
   is #revopen2 precisely so the two cannot collide. */
if (markup.split('id="revopen"').length !== 2)
  throw new Error('the pair-review button was disturbed');

/* ARTWORK AND NAME ARE TWO ANSWERS. Collapsing them into one would lose the
   distinction the handoff asks for: a right picture under a wrong name. */
if (code.indexOf('e.artworkAccepted=!e.artworkAccepted;') < 0)
  throw new Error('artwork acceptance is not its own answer');
if (code.indexOf('e.nameAccepted=true;') < 0)
  throw new Error('name acceptance is not its own answer');

/* A RENAME GOES THROUGH saveTrait, not through a private mover. */
const nStart = code.indexOf("$('revnamed').onclick=async()=>{");
const nEnd = code.indexOf('};', code.indexOf('await renderReview();', nStart));
const named = code.slice(nStart, nEnd);
if (named.indexOf('await saveTrait();') < 0)
  throw new Error('accepting a name does not use the path that moves a trait');
if (named.indexOf('dbPut(') >= 0 || named.indexOf('dbDel(') >= 0)
  throw new Error('the rename writes records itself instead of using saveTrait');

/* EVERY MOVE IS WRITTEN DOWN, or the pass cannot resume. */
if (code.indexOf('  REVIEW.activeId=REVIEW.entries[n].id;\r\n  await saveReview();') < 0)
  throw new Error('moving through the queue is not persisted');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
