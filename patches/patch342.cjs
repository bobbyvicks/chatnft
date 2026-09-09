/* THE WORKSPACE IS THE EDITOR, NOT A DASHBOARD.

   The handoff says it in as many words - "do not make this only a chat box or
   a checklist the user must operate" - and the first version of the Agent page
   was exactly that: two buttons and a wall of JSON. The art was nowhere on it.

   What the workflow actually asks for is a place where the agent does the
   setup, processing and checks, and the OWNER compares, adjusts and approves.
   That is not a page beside the editor. It is the editor, with the agent's
   work visible next to the artwork.

   So: the Agent page opens a trait into the editor, and the editor gains an
   Agent panel holding the two things the owner's half of the job needs and
   this site has never had.

     BEFORE AND AFTER, on the same grid, at the same zoom. Requirement 4 of the
     handoff, and the thing that makes "the user compares results" possible at
     all. Hold the button and the canvas shows the trait as it arrived; let go
     and it is back. Nothing is copied, moved or re-encoded to do it - the
     editor already keeps the opening image for Reset, so the comparison is
     against exactly what came in.

     WHAT WAS DONE TO IT, in order, with counts. An agent that repaired eight
     findings and tidied forty blocks should not have to be believed about it;
     the log says which step, when, and how many pixels moved. Every operation
     that already reports a count feeds it, so the log cannot drift from what
     the operations actually did.

   The census jobs stay on the Agent page. They are collection-wide questions
   and they belong there; they were never the workspace.
*/
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

/* ---- 1. the compare overlay --------------------------------------------- */
swap(block([
  '#qapv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:3;',
  '  image-rendering:pixelated;}',
]), block([
  '#qapv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:3;',
  '  image-rendering:pixelated;}',
  '/* Above everything, because the whole point is to hide what is under it. */',
  '#cmppv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:4;',
  '  image-rendering:pixelated;}',
  '#aglog{display:flex; flex-direction:column; gap:2px; margin:6px 0; font-size:12px;}',
  '.agstep{color:var(--muted);}',
  '.agstep b{color:var(--ink); font-weight:600;}',
]));

swap('<canvas id="olpv"></canvas><canvas id="qapv"></canvas><div id="bcur"></div>',
  '<canvas id="olpv"></canvas><canvas id="qapv"></canvas><canvas id="cmppv"></canvas><div id="bcur"></div>');

/* ---- 2. the panel, first in the column ---------------------------------- */
swap(block([
  '    <section>',
  '      <h2>Pixel inspection</h2>',
]), block([
  '    <section>',
  '      <h2>Agent</h2>',
  '      <div class="stack">',
  '        <p class="note mono" id="agwork">Nothing open.</p>',
  '        <button class="btn ghost" id="agbefore"',
  '          title="Hold to see the trait as it arrived. Nothing is changed by looking.">Hold to see before</button>',
  '        <div id="aglog"></div>',
  '        <p class="note">Every step that changes pixels writes itself here with',
  '          its own count, so the log cannot drift from what was done.</p>',
  '      </div>',
  '    </section>',
  '    <section>',
  '      <h2>Pixel inspection</h2>',
]));

/* ---- 3. the log, and the comparison ------------------------------------- */
swap(block([
  '/* ================= pixel inspection: the panel ==================== */',
]), block([
  '/* ================= the agent workspace =========================== */',
  '/* WHAT WAS DONE TO THIS TRAIT, in order. Not a narration: every entry is',
  '   written by the operation that did the work, with the count that operation',
  '   already reports, so the log cannot claim something the pixels do not. */',
  'let AGENT_LOG=[];',
  'function agentStep(what,detail){',
  '  AGENT_LOG.push({at:Date.now(), what:what, detail:detail||""});',
  '  agentLogShow();',
  '}',
  'function agentLogShow(){',
  '  const box=$("aglog"); if(!box) return;',
  '  box.replaceChildren();',
  '  /* Newest last, like a transcript: this is a record of a pass, and reading',
  '     it backwards makes the order of operations unrecoverable. */',
  '  for(const s of AGENT_LOG.slice(-12)){',
  '    const p=document.createElement("p");',
  '    p.className="agstep";',
  '    const b=document.createElement("b");',
  '    b.textContent=s.what;',
  '    p.appendChild(b);',
  '    if(s.detail) p.appendChild(document.createTextNode(" \\u00b7 "+s.detail));',
  '    box.appendChild(p);',
  '  }',
  '}',
  '/* Which trait, and what the collection has already decided about its layer.',
  '   The rules are the settings nobody should have to repeat, so the panel says',
  '   them rather than making somebody go and look. */',
  'function agentWorkShow(){',
  '  const el=$("agwork"); if(!el) return;',
  '  if(!art||!art.width){ el.textContent="Nothing open."; return; }',
  '  const layer=$("tlayer")?$("tlayer").value:"";',
  '  let ruled=0; try{ ruled=ruleGridFor(layer); }catch(_){ }',
  '  el.textContent=(fileName||"untitled")+"  \\u00b7  "+art.width+"\\u00d7"+art.height',
  '    +(layer?"  \\u00b7  "+layer:"")',
  '    +"  \\u00b7  "+(ruled?"grid "+ruled+"px by the collection rules"',
  '      :"no grid rule for this layer");',
  '}',
  '/* HOLD TO SEE BEFORE. The editor already keeps the opening image so Reset',
  '   can work, which means the comparison is against exactly what arrived -',
  '   nothing is copied, re-encoded or reconstructed to show it.',
  '',
  '   Held rather than toggled: a toggle left on is a canvas showing the old',
  '   pixels while somebody paints, and there is no way to tell from looking. */',
  'function agentBefore(on){',
  '  const cv=$("cmppv"); if(!cv||!art||!art.width) return;',
  '  if(!on||!original){ cv.style.display="none"; return; }',
  '  if(cv.width!==original.width||cv.height!==original.height){',
  '    cv.width=original.width; cv.height=original.height;',
  '  }',
  '  cv.style.width=art.style.width||""; cv.style.height=art.style.height||"";',
  '  const g=cv.getContext("2d");',
  '  g.clearRect(0,0,cv.width,cv.height);',
  '  g.putImageData(original,0,0);',
  '  cv.style.display="block";',
  '}',
  '/* ================= pixel inspection: the panel ==================== */',
]));

/* ---- 4. wired ------------------------------------------------------------ */
swap(block([
  "if($('qascan')) $('qascan').onclick=()=>qaRunScan();",
]), block([
  '/* Pointer, not click: it is held. up and leave both let go, because a',
  '   pointer that leaves the button never sends up and the before image',
  '   would stay on screen over live pixels. */',
  'const bfr=$("agbefore");',
  'if(bfr){',
  '  bfr.onpointerdown=e=>{ e.preventDefault(); agentBefore(true); };',
  '  bfr.onpointerup=()=>agentBefore(false);',
  '  bfr.onpointerleave=()=>agentBefore(false);',
  '  bfr.onpointercancel=()=>agentBefore(false);',
  '  /* And for a keyboard: space and enter fire click, which has no hold. */',
  '  bfr.onclick=()=>{ agentBefore(true); setTimeout(()=>agentBefore(false),900); };',
  '}',
  "if($('qascan')) $('qascan').onclick=()=>qaRunScan();",
]));

/* ---- 5. the operations write their own lines ---------------------------- */
swap(block([
  '  toast("Tidied "+r.blocks+" block"+(r.blocks===1?"":"s")+" to the "+n',
  '    +"px grid: "+r.pixels+" pixel"+(r.pixels===1?"":"s")+" changed");',
]), block([
  '  toast("Tidied "+r.blocks+" block"+(r.blocks===1?"":"s")+" to the "+n',
  '    +"px grid: "+r.pixels+" pixel"+(r.pixels===1?"":"s")+" changed");',
  '  agentStep("Tidied to the "+n+"px grid",',
  '    r.blocks+" blocks, "+r.pixels+" pixels");',
]));

swap(block([
  '  toast("Repaired "+out.changes.length+" finding"+(out.changes.length===1?"":"s")',
  '    +": "+n+" pixel"+(n===1?"":"s")+" changed");',
]), block([
  '  toast("Repaired "+out.changes.length+" finding"+(out.changes.length===1?"":"s")',
  '    +": "+n+" pixel"+(n===1?"":"s")+" changed");',
  '  agentStep("Repaired "+out.changes.length+" finding"',
  '    +(out.changes.length===1?"":"s"), n+" pixels");',
]));

/* ---- 6. a fresh trait is a fresh pass ----------------------------------- */
swap(block([
  '  try{ buildPixelSizes(wantBlock); pixelSizeReport(); }catch(_){ }',
]), block([
  '  try{ buildPixelSizes(wantBlock); pixelSizeReport(); }catch(_){ }',
  '  try{ agentWorkShow(); }catch(_){ }',
]));

swap(block([
  "  fileName=t.name+\".png\";",
]), block([
  '  /* A new trait is a new pass. Carrying the previous trait\'s log over would',
  '     credit this one with work done to something else. */',
  '  AGENT_LOG=[];',
  '  try{ agentLogShow(); }catch(_){ }',
  "  fileName=t.name+\".png\";",
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function agentBefore(on){', 'function agentStep(what,detail){',
  'function agentWorkShow(){', 'agentStep("Tidied to the "+n+"px grid",'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
for (const id of ['cmppv', 'agwork', 'agbefore', 'aglog'])
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error('id not in the markup exactly once: ' + id);

/* THE COMPARISON IS AGAINST WHAT ARRIVED, not against a copy taken later.
   `original` is the image the editor keeps so Reset can work; anything else
   would be comparing the trait with a moment nobody chose. */
const bStart = code.indexOf('function agentBefore(on){');
const bEnd = code.indexOf(NL + '/* ================= pixel inspection: the panel', bStart);
if (bStart < 0) throw new Error('could not find agentBefore');
const cmp = code.slice(bStart, bEnd > 0 ? bEnd : bStart + 900);
if (cmp.indexOf('putImageData(original,0,0)') < 0)
  throw new Error('the comparison is no longer against the opening image');

/* AND IT LETS GO. A held control that misses pointerleave leaves the old
   pixels on screen over live ones, and nothing about looking at it says so. */
const wStart = code.indexOf('const bfr=$("agbefore");');
const wire = code.slice(wStart, wStart + 700);
for (const ev of ['onpointerup', 'onpointerleave', 'onpointercancel'])
  if (wire.indexOf(ev) < 0) throw new Error('the before image can be left on screen: ' + ev);

/* THE LOG IS WRITTEN BY THE OPERATIONS, so it cannot claim work the pixels do
   not show. Two today; a third that reports a count and does not log is a
   step that happened invisibly. */
if (code.split('agentStep(').length - 1 < 3)
  throw new Error('an operation that changes pixels is not writing to the log');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
