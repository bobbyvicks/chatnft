/* PIXEL INSPECTION: the half you click.

   The measurement landed last commit. This is the panel that drives it, built
   from Codex's pixel-qa-panel.js for this site's markup and idioms rather than
   copied: scan, a category filter, a findings list you can walk, an overlay
   that draws every finding on the canvas, select-and-apply for the repairs the
   core is willing to suggest, protected boxes for logos and lettering, and a
   coordinate report you can download.

   HIS GRID SELECTOR IS WHERE "4x4 AND 8x8" CAME FROM, so it is here - with the
   size this trait is actually drawn at added to it, which this site knows and
   his does not. Choosing the wrong grid is the difference between "3198 mixed
   cells" and "none", and the honest default is the measurement.

   THE FINDING HAS TO BE FINDABLE. A one-pixel island on a 1280 canvas drawn at
   fit zoom is a third of a screen pixel: highlighting it truthfully makes it
   invisible. The current finding's box is drawn no smaller than about ten
   screen pixels, so walking the list actually shows you where to look.

   AND A STALE SCAN CANNOT BE APPLIED. qaRepair already refuses on changed
   pixels; this drops the report the moment anything touches the canvas, so the
   list never offers a repair whose coordinates have moved.
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

/* ---- 1. the overlay, and the list rows ---------------------------------- */
swap(block([
  '#olpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:2;',
  '  image-rendering:pixelated;}',
]), block([
  '#olpv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:2;',
  '  image-rendering:pixelated;}',
  '/* Above the outline preview, and never in the way of a brush stroke. */',
  '#qapv{position:absolute; left:0; top:0; display:none; pointer-events:none; z-index:3;',
  '  image-rendering:pixelated;}',
  '#qalist{display:flex; flex-direction:column; gap:2px; margin:4px 0;}',
  '.qafind{display:flex; align-items:center; gap:6px;}',
  '.qafind button{flex:1; text-align:left;}',
  '.qafind.qanow button{outline:1px solid var(--accent);}',
  '/* A browser checkbox is 13px and this panel has a 22px floor on anything',
  '   you have to hit. Scoped to the editing column so the project page keeps',
  '   its own sizing. This is the first checkbox in here, which is why the',
  '   floor had never been tested against one. */',
  '.side .olchk input[type=checkbox]{width:22px; height:22px; flex:none;}',
]));

/* ---- 2. the overlay canvas in the frame --------------------------------- */
swap('<div id="grid"></div><canvas id="olpv"></canvas><div id="bcur"></div>',
  '<div id="grid"></div><canvas id="olpv"></canvas><canvas id="qapv"></canvas><div id="bcur"></div>');

/* ---- 3. the panel ------------------------------------------------------- */
swap(block([
  '    <section>',
  '      <h2>Base layer</h2>',
]), block([
  '    <section>',
  '      <h2>Pixel inspection</h2>',
  '      <div class="stack">',
  '        <p class="note">Scans the exact canvas pixels. A finding is a measurement,',
  '          not proof of bad art.</p>',
  '        <div class="olrow"><label for="qacell">Grid</label>',
  '          <select id="qacell" style="flex:1"',
  '            title="The artwork grid to measure cells against. The size this trait is drawn at is marked."></select></div>',
  '        <div class="olrow"><label for="qamark"',
  '          title="How big a mark can be and still count as a small island, in canvas pixels. Independent of the grid, so an enlarged dot is caught too.">Mark limit</label>',
  '          <input id="qamark" type="number" min="1" max="64" value="12" style="width:72px"',
  '            aria-label="Small mark limit, in canvas pixels"></div>',
  '        <button class="btn" id="qascan">Scan artwork</button>',
  '        <p class="note" id="qastatus" role="status">Not scanned.</p>',
  '        <div class="olrow"><label for="qafilter">Show</label>',
  '          <select id="qafilter" style="flex:1">',
  '            <option value="speck">Small colour islands</option>',
  '            <option value="thin">Native 1px fragments</option>',
  '            <option value="narrow">Thin at grid scale</option>',
  '            <option value="mixed">Mixed grid cells</option>',
  '            <option value="alpha">Partial transparency</option>',
  '            <option value="all">All categories (they overlap)</option>',
  '          </select></div>',
  '        <label class="olchk"><input id="qahi" type="checkbox" checked> Highlight findings</label>',
  '        <div class="savebar btnrow">',
  '          <button class="mini" id="qaprev">Previous</button>',
  '          <button class="mini" id="qanext">Next</button></div>',
  '        <p class="note mono" id="qadetail">Scan to see coordinates.</p>',
  '        <div id="qalist" aria-label="Pixel findings"></div>',
  '        <div class="savebar btnrow">',
  '          <button class="mini" id="qapick">Select suggested</button>',
  '          <button class="mini" id="qaclear">Clear</button></div>',
  '        <button class="btn ghost" id="qaapply" disabled>Apply selected repairs</button>',
  '        <p class="note">Only an enclosed small island is ever suggested, and only',
  '          when the colour around it agrees. Outlines, lettering, deliberate',
  '          diagonals, strokes, edges and protected areas stay manual. Undo works.</p>',
  '        <div class="rule"></div>',
  '        <p class="note">Protect a logo or lettering from every automatic repair.</p>',
  '        <div class="olrow"><label for="qarx">Protect</label>',
  '          <input id="qarx" type="number" min="0" value="0" style="width:56px" aria-label="Protected box left">',
  '          <input id="qary" type="number" min="0" value="0" style="width:56px" aria-label="Protected box top">',
  '          <input id="qarw" type="number" min="1" value="64" style="width:56px" aria-label="Protected box width">',
  '          <input id="qarh" type="number" min="1" value="64" style="width:56px" aria-label="Protected box height">',
  '          <button class="mini" id="qaadd">Add</button></div>',
  '        <div id="qarects"></div>',
  '        <button class="btn ghost" id="qareport" disabled>Download report</button>',
  '      </div>',
  '    </section>',
  '    <section>',
  '      <h2>Base layer</h2>',
]));

/* ---- 4. the panel's own state and drawing ------------------------------- */
swap(block([
  '/* ================= pixel inspection ============================= */',
]), block([
  '/* ================= pixel inspection: the panel ==================== */',
  'let QA=null, QA_SEL=new Set(), QA_AT=-1, QA_BUSY=false, QA_RECTS=[], QA_LAST=null;',
  'const QA_COLOURS={speck:"#ff7c3b", thin:"#ff4aa0", narrow:"#c880ff",',
  '  mixed:"#ffc947", alpha:"#36dceb"};',
  'const QA_NAMES={speck:"small colour island", thin:"native 1px fragment",',
  '  narrow:"grid-width fragment", mixed:"mixed grid cell", alpha:"partial-alpha group"};',
  'function qaVisible(){',
  '  if(!QA) return [];',
  '  const want=$("qafilter").value;',
  '  return want==="all" ? QA.findings : QA.findings.filter(f=>f.kind===want);',
  '}',
  'function qaCurrent(){ return qaVisible()[QA_AT]; }',
  '/* THE REPORT DESCRIBES PIXELS THAT ARE NO LONGER THERE. Called from every',
  '   route that changes the canvas, so the list cannot go on offering repairs',
  '   whose coordinates have moved. qaRepair refuses them anyway; this is so',
  '   nobody has to meet that refusal. */',
  'function qaInvalidate(why){',
  '  if(!QA&&QA_AT<0&&!QA_SEL.size) { qaDraw(); return; }',
  '  QA=null; QA_SEL.clear(); QA_AT=-1; QA_LAST=null;',
  '  const s=$("qastatus"); if(s) s.textContent=why||"Canvas changed - scan again.";',
  '  const l=$("qalist"); if(l) l.replaceChildren();',
  '  const d=$("qadetail"); if(d) d.textContent="Scan to see coordinates.";',
  '  qaButtons(); qaDraw();',
  '}',
  'function qaButtons(){',
  '  const ready=!!QA&&!QA_BUSY, rows=qaVisible().length;',
  '  const set=(id,off)=>{ const el=$(id); if(el) el.disabled=!!off; };',
  '  set("qascan",QA_BUSY);',
  '  set("qaapply",!ready||!QA_SEL.size);',
  '  const a=$("qaapply");',
  '  if(a) a.textContent="Apply selected repairs"+(QA_SEL.size?" ("+QA_SEL.size+")":"");',
  '  set("qareport",!ready); set("qapick",!ready);',
  '  set("qaprev",!ready||!rows); set("qanext",!ready||!rows);',
  '}',
  '/* Every finding, and the current one boxed.',
  '',
  '   THE BOX HAS A MINIMUM SIZE ON SCREEN. A one-pixel island on a 1280 canvas',
  '   at fit zoom is a third of a screen pixel, so drawing it truthfully makes',
  '   it invisible and walking the list shows you nothing. */',
  'function qaDraw(){',
  '  const cv=$("qapv"); if(!cv||!art||!art.width) return;',
  '  if(cv.width!==art.width||cv.height!==art.height){ cv.width=art.width; cv.height=art.height; }',
  '  cv.style.width=art.style.width||""; cv.style.height=art.style.height||"";',
  '  cv.style.display = QA ? "block" : "none";',
  '  const g=cv.getContext("2d");',
  '  g.clearRect(0,0,cv.width,cv.height);',
  '  g.imageSmoothingEnabled=false;',
  '  for(const r of QA_RECTS){ g.strokeStyle="#57e9ba"; g.lineWidth=1;',
  '    g.strokeRect(r[0]+0.5,r[1]+0.5,r[2]-r[0]-1,r[3]-r[1]-1); }',
  '  if(!QA) return;',
  '  if($("qahi")&&$("qahi").checked) for(const f of qaVisible()){',
  '    g.fillStyle=(f.protected?"#57e9ba":(QA_COLOURS[f.kind]||"#ffffff"))+"80";',
  '    for(const run of f.runs) g.fillRect(run[1],run[0],run[2],1);',
  '  }',
  '  const f=qaCurrent();',
  '  if(f){',
  '    const shown=art.clientWidth||art.width;',
  '    const scale=shown/art.width;',
  '    const least=scale>0 ? Math.ceil(10/scale) : 1;',
  '    const w=Math.max(f.bounds[2]-f.bounds[0],least);',
  '    const h=Math.max(f.bounds[3]-f.bounds[1],least);',
  '    g.strokeStyle="#ffffff"; g.lineWidth=Math.max(1,Math.round(least/6));',
  '    g.strokeRect(f.bounds[0]-0.5,f.bounds[1]-0.5,w+1,h+1);',
  '  }',
  '}',
  'function qaChoose(i){',
  '  const rows=qaVisible(); if(!rows.length) return;',
  '  QA_AT=((i%rows.length)+rows.length)%rows.length;',
  '  qaRender();',
  '}',
  'function qaRender(){',
  '  if(!QA){ qaButtons(); qaDraw(); return; }',
  '  const c=QA.counts;',
  '  $("qastatus").textContent=c.speck+" small islands \\u00b7 "+c.thinPixels',
  '    +" native thin pixels \\u00b7 "+c.mixed+" mixed cells \\u00b7 "+c.alphaPixels',
  '    +" partial-alpha pixels. "+c.fixable+" suggested repairs, "+c.protected',
  '    +" protected. Categories overlap."+(QA_LAST?" Last apply: "+QA_LAST+" pixels.":"");',
  '  const rows=qaVisible();',
  '  if(QA_AT>=rows.length) QA_AT=rows.length-1;',
  '  /* Eight at a time, around wherever you are. A list of 3,198 mixed cells',
  '     is a page nobody scrolls. */',
  '  const start=QA_AT<0?0:Math.floor(QA_AT/8)*8;',
  '  const list=$("qalist"); list.replaceChildren();',
  '  for(let i=start;i<Math.min(rows.length,start+8);i++){',
  '    const f=rows[i], line=document.createElement("div");',
  '    line.className="qafind"+(i===QA_AT?" qanow":"");',
  '    const tick=document.createElement("input");',
  '    tick.type="checkbox"; tick.disabled=!f.fixable; tick.checked=QA_SEL.has(f.id);',
  '    tick.setAttribute("aria-label","Select repair "+f.id);',
  '    tick.onchange=()=>{ if(tick.checked) QA_SEL.add(f.id); else QA_SEL.delete(f.id);',
  '      qaButtons(); qaDraw(); };',
  '    const b=document.createElement("button");',
  '    b.type="button"; b.className="mini";',
  '    b.textContent=(i+1)+". ("+f.bounds[0]+", "+f.bounds[1]+") "',
  '      +(f.bounds[2]-f.bounds[0])+"\\u00d7"+(f.bounds[3]-f.bounds[1])',
  '      +(f.protected?" \\u00b7 protected":"");',
  '    b.onclick=()=>qaChoose(i);',
  '    line.append(tick,b); list.append(line);',
  '  }',
  '  const f=qaCurrent();',
  '  $("qadetail").textContent = f',
  '    ? (QA_AT+1)+"/"+rows.length+" "+(QA_NAMES[f.kind]||f.kind)+" \\u00b7 "+f.area',
  '      +" px \\u00b7 x "+f.bounds[0]+", y "+f.bounds[1]+", w "+(f.bounds[2]-f.bounds[0])',
  '      +", h "+(f.bounds[3]-f.bounds[1])+". "+f.reason',
  '    : rows.length+" findings here. Choose one to box it on the canvas.";',
  '  qaButtons(); qaDraw();',
  '}',
  '/* 4 and 8 because the collection work asked for them, 1 for native art, and',
  '   the size this trait is actually drawn at - which this site measures when',
  '   the trait opens and is the only one of the four that is not a guess. */',
  'function qaBuildCells(){',
  '  const sel=$("qacell"); if(!sel) return;',
  '  const keep=sel.value, m=Math.max(1,gridBlock|0);',
  '  const want=[...new Set([m,4,8,1])].filter(n=>n>=1&&n<=64).sort((a,b)=>a-b);',
  '  sel.innerHTML="";',
  '  for(const n of want){',
  '    const o=document.createElement("option");',
  '    o.value=String(n);',
  '    o.textContent=n+"\\u00d7"+n+" px"+(n===m&&m>1?" (this art)":(n===1?" native":""));',
  '    sel.appendChild(o);',
  '  }',
  '  const has=v=>[...sel.options].some(o=>o.value===String(v));',
  '  sel.value = has(m)&&m>1 ? String(m) : (has(keep)?keep:String(want[0]));',
  '}',
  'function qaRenderRects(){',
  '  const box=$("qarects"); if(!box) return;',
  '  box.replaceChildren();',
  '  QA_RECTS.forEach((r,i)=>{',
  '    const b=document.createElement("button");',
  '    b.type="button"; b.className="mini";',
  '    b.textContent="Remove "+(i+1)+": ("+r[0]+", "+r[1]+") "+(r[2]-r[0])+"\\u00d7"+(r[3]-r[1]);',
  '    b.onclick=()=>{ QA_RECTS.splice(i,1); qaRenderRects();',
  '      qaInvalidate("Protection changed - scan again."); };',
  '    box.append(b);',
  '  });',
  '}',
  'async function qaRunScan(){',
  '  if(!art||!art.width||!ctx){ $("qastatus").textContent="Open a trait first."; return; }',
  '  QA_BUSY=true; QA=null; QA_SEL.clear(); QA_AT=-1;',
  '  qaButtons(); qaDraw();',
  '  $("qastatus").textContent="Scanning every canvas pixel...";',
  '  /* One turn, so the message is on screen before a second of work. */',
  '  await new Promise(r=>setTimeout(r,0));',
  '  try{',
  '    const im=ctx.getImageData(0,0,art.width,art.height);',
  '    QA=qaScan({width:art.width,height:art.height,data:im.data},',
  '      {cellSize:Math.max(1,parseInt($("qacell").value,10)||4),',
  '       markSize:Math.max(1,Math.min(64,parseInt($("qamark").value,10)||12)),',
  '       protectedRects:QA_RECTS.map(r=>r.slice())});',
  '  }catch(e){ QA=null; $("qastatus").textContent=(e&&e.message)||"Could not scan that canvas."; }',
  '  QA_BUSY=false;',
  '  if(QA) qaRender(); else { qaButtons(); qaDraw(); }',
  '}',
  '/* ================= pixel inspection ============================= */',
]));

/* ---- 5. wired ------------------------------------------------------------ */
swap(block([
  "$('rssnap').onclick=()=>{ toggle('rssnap'); resizePreview(); };",
]), block([
  "$('rssnap').onclick=()=>{ toggle('rssnap'); resizePreview(); };",
  "if($('qascan')) $('qascan').onclick=()=>qaRunScan();",
  "if($('qafilter')) $('qafilter').onchange=()=>{ QA_AT=-1; qaRender(); };",
  "if($('qahi')) $('qahi').onchange=()=>qaDraw();",
  "if($('qaprev')) $('qaprev').onclick=()=>qaChoose(QA_AT-1);",
  "if($('qanext')) $('qanext').onclick=()=>qaChoose(QA_AT+1);",
  "if($('qapick')) $('qapick').onclick=()=>{",
  '  if(!QA) return;',
  '  for(const f of qaVisible()) if(f.fixable) QA_SEL.add(f.id);',
  '  qaRender();',
  '};',
  "if($('qaclear')) $('qaclear').onclick=()=>{ QA_SEL.clear(); qaRender(); };",
  "if($('qacell')) $('qacell').onchange=()=>qaInvalidate('Grid changed - scan again.');",
  "if($('qamark')) $('qamark').onchange=()=>qaInvalidate('Mark limit changed - scan again.');",
  "if($('qaadd')) $('qaadd').onclick=()=>{",
  '  if(!art||!art.width) return;',
  "  const x=parseInt($('qarx').value,10)||0, y=parseInt($('qary').value,10)||0;",
  "  const w=parseInt($('qarw').value,10)||0, h=parseInt($('qarh').value,10)||0;",
  '  const r=[x,y,x+w,y+h];',
  '  /* Refused here as well as in the scan, so the message names the box',
  '     rather than arriving as a failed scan later. */',
  '  if(w<1||h<1||x<0||y<0||r[2]>art.width||r[3]>art.height){',
  "    $('qastatus').textContent='A protected box has to fit inside the canvas.'; return; }",
  '  QA_RECTS.push(r); qaRenderRects();',
  "  qaInvalidate('Protection changed - scan again.');",
  '};',
  "if($('qareport')) $('qareport').onclick=()=>{",
  '  if(!QA) return;',
  '  const doc=qaExportReport(QA);',
  '  const url=URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)],{type:"application/json"}));',
  '  const a=document.createElement("a");',
  '  a.href=url;',
  '  a.download=(fileName||"trait").replace(/\\.png$/i,"")+"-inspection.json";',
  '  a.click();',
  '  setTimeout(()=>URL.revokeObjectURL(url),1000);',
  '};',
  "if($('qaapply')) $('qaapply').onclick=()=>{",
  '  if(!QA||!QA_SEL.size||!ctx) return;',
  '  const im=ctx.getImageData(0,0,art.width,art.height);',
  '  let out;',
  '  try{ out=qaRepair({width:art.width,height:art.height,data:im.data},QA,[...QA_SEL]); }',
  "  catch(e){ qaInvalidate((e&&e.message)||'Could not apply those repairs.'); return; }",
  '  if(!out.changedPixels){ toast("Nothing changed"); return; }',
  '  /* Snapshot BEFORE the pixels move, like every other operation here. */',
  '  snapshot();',
  '  const put=new ImageData(out.data,out.width,out.height);',
  '  ctx.putImageData(put,0,0);',
  '  refreshStats(); repalette();',
  '  const n=out.changedPixels;',
  '  toast("Repaired "+out.changes.length+" finding"+(out.changes.length===1?"":"s")',
  '    +": "+n+" pixel"+(n===1?"":"s")+" changed");',
  '  /* The report now describes the canvas as it was BEFORE the repair, so it',
  '     is dropped rather than left to be applied twice. */',
  "  qaInvalidate('Repairs applied - scan again to see what is left.');",
  '  /* AND SAID AFTERWARDS, because snapshot() invalidates first: by the time',
  '     the line above runs there is nothing left to clear and it returns early,',
  '     leaving the generic canvas-changed line where the useful sentence should',
  '     be. Measured on a real trait - the panel said "Canvas changed" after',
  '     repairing eight findings. */',
  '  $("qastatus").textContent="Repaired "+out.changes.length+" finding"',
  '    +(out.changes.length===1?"":"s")+", "+n+" pixel"+(n===1?"":"s")',
  '    +" changed. Scan again to see what is left.";',
  '  /* AFTER the invalidate, which clears it. The next scan says how much the',
  '     last apply moved, which is the number somebody wants when they are',
  '     deciding whether to press it again. */',
  '  QA_LAST=n;',
  '};',
]));

/* ---- 6. the report is dropped whenever the canvas moves ----------------- */
swap(block([
  'function snapshot(){',
  '  undoStack.push(ctx.getImageData(0,0,art.width,art.height));',
]), block([
  'function snapshot(){',
  '  /* EVERY MUTATION COMES THROUGH HERE, which makes it the one place a stale',
  '     inspection can be dropped without hunting for call sites. */',
  '  try{ if(QA) qaInvalidate("Canvas changed - scan again."); }catch(_){ }',
  '  undoStack.push(ctx.getImageData(0,0,art.width,art.height));',
]));

swap(block([
  'function restoreImage(im){',
  '  if(art.width!==im.width||art.height!==im.height){',
  '    art.width=im.width; art.height=im.height;',
  '    N=im.width;',
  '    const opv=$("olpv"); opv.width=im.width; opv.height=im.height;',
]), block([
  'function restoreImage(im){',
  '  /* Undo, redo and reset do not go through snapshot, and all three replace',
  '     the pixels a report was measured from. */',
  '  try{ if(QA) qaInvalidate("Canvas changed - scan again."); }catch(_){ }',
  '  if(art.width!==im.width||art.height!==im.height){',
  '    art.width=im.width; art.height=im.height;',
  '    N=im.width;',
  '    const opv=$("olpv"); opv.width=im.width; opv.height=im.height;',
  '    const qpv=$("qapv"); if(qpv){ qpv.width=im.width; qpv.height=im.height; }',
]));

/* ---- 7. and the grid list follows the measurement ----------------------- */
swap(block([
  '  try{ buildPixelSizes(gridBlock); pixelSizeReport(); }catch(_){ }',
]), block([
  '  try{ buildPixelSizes(gridBlock); pixelSizeReport(); }catch(_){ }',
  '  /* The inspection grid offers the measured size too, and defaults to it. */',
  '  try{ qaBuildCells(); }catch(_){ }',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function qaRunScan(){', 'function qaRender(){', 'function qaDraw(){',
  'function qaBuildCells(){', 'function qaInvalidate(why){'])
  if (code.indexOf(s.replace('function qaRunScan(){', 'async function qaRunScan(){')) < 0
    && code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
for (const id of ['qapv', 'qacell', 'qamark', 'qascan', 'qastatus', 'qafilter', 'qahi',
  'qaprev', 'qanext', 'qadetail', 'qalist', 'qapick', 'qaclear', 'qaapply',
  'qarx', 'qary', 'qarw', 'qarh', 'qaadd', 'qarects', 'qareport'])
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error('id not in the markup exactly once: ' + id);

/* THE REPAIR IS UNDOABLE, and the snapshot is taken before the pixels move. */
const aStart = code.indexOf("$('qaapply').onclick=()=>{");
if (aStart < 0) throw new Error('could not find the apply handler');
const apply = code.slice(aStart, aStart + 1600);
if (apply.indexOf('snapshot();') < 0) throw new Error('the repair is not undoable');
if (apply.indexOf('snapshot();') > apply.indexOf('ctx.putImageData'))
  throw new Error('the snapshot is taken after the pixels have moved');
/* AND A FAILED REPAIR DOES NOT LAND IN THE HISTORY. */
if (apply.indexOf('catch(e){ qaInvalidate(') > apply.indexOf('snapshot();'))
  throw new Error('a refused repair still pushes an undo step');

/* A STALE REPORT IS DROPPED AT BOTH CHOKEPOINTS. Without the second one, undo
   leaves a list of findings describing pixels that are no longer there. */
const snapAt = code.indexOf('function snapshot(){');
if (code.slice(snapAt, snapAt + 300).indexOf('qaInvalidate(') < 0)
  throw new Error('a mutation leaves the inspection standing');
const restAt = code.indexOf('function restoreImage(im){');
if (code.slice(restAt, restAt + 300).indexOf('qaInvalidate(') < 0)
  throw new Error('undo leaves the inspection standing');

/* THE CURRENT FINDING IS VISIBLE AT FIT ZOOM. A truthful one-pixel box on a
   1280 canvas is a third of a screen pixel. */
const dStart = code.indexOf('function qaDraw(){');
const draw = code.slice(dStart, dStart + 1600);
if (draw.indexOf('Math.ceil(10/scale)') < 0)
  throw new Error('the current finding has no minimum size on screen');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
