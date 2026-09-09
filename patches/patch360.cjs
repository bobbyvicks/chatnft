/* A FIX PIXELS TAB, WITH RETRO DIFFUSION'S PIXEL ART FIXER BEHIND IT.

   "https://github.com/Retro-Diffusion/pixel-art-fixer.git i want this coded
   into our site" / "make it a new tab at the top". The tool takes fake pixel
   art - an upscale, an AI render, anything where the pixels drifted off the
   grid or landed at 6.38 to a cell - finds the grid it was drawn on with four
   independent detectors, and rebuilds every cell as one real pixel at the
   size the art was always meant to be. Their benchmark has it recovering the
   exact native size on 77% of 4,300 damaged images where the next tool
   manages 4%.

   The engine is their Python, ported to dependency-free JavaScript and
   verified against the original on the same images - see
   scratchpad/pixelfixer-js/tools/. It arrives here as ONE bundle, pasted into
   a <script type="text/plain"> so the page does not run it on the main
   thread: the tab reads that text and starts a Worker from it. Detection on
   a 1280 trait takes seconds, and a page that freezes for seconds reads as a
   page that broke.

   THE PATCH TAKES THE BUNDLE PATH FROM PF_BUNDLE and refuses to run without
   it. A tab that says "Fix it" and does nothing is worse than no tab.

   Same rules as every other page: nothing leaves the device, the result is
   shown before anything is done with it, and "Open in the editor" hands the
   fixed pixels to startEditor exactly as a dropped PNG would be.
*/
const fs = require('fs');
const kit = require('C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/tools/patchkit.cjs');

const FILE = process.env.PB_INDEX || 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const BUNDLE = process.env.PF_BUNDLE;
if (!BUNDLE || !fs.existsSync(BUNDLE)) throw new Error('PF_BUNDLE must name the built pixelfixer.bundle.js');
const bundle = fs.readFileSync(BUNDLE, 'utf8');
if (bundle.indexOf('</script') >= 0) throw new Error('the bundle contains </script and cannot be inlined as-is');
if (bundle.indexOf('PF.process') < 0 && bundle.indexOf('process') < 0) throw new Error('the bundle has no process() entry point');

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

/* ---- 1. a fifth page ---------------------------------------------------- */
swap('const PAGES=["home","project","settings","agent"];',
  'const PAGES=["home","project","settings","agent","fixer"];');
swap(block([
  '    <button type="button" class="pgtab" data-page="agent"',
  '      title="Questions about the whole collection at once, for you and for an agent">Agent</button>',
]), block([
  '    <button type="button" class="pgtab" data-page="agent"',
  '      title="Questions about the whole collection at once, for you and for an agent">Agent</button>',
  '    <button type="button" class="pgtab" data-page="fixer"',
  '      title="Turn fake pixel art into real pixels at its native size">Fix pixels</button>',
]));
/* The pairwise hiding rules, one line per (page, section) as the block above
   them insists on: the failure they prevent is a section appearing on a page
   nobody meant it to, and a clever selector is where that hides. */
swap(block([
  '#land[data-page="agent"] .pg-home,',
  '#land[data-page="agent"] .pg-project,',
  '#land[data-page="agent"] .pg-settings{display:none;}',
]), block([
  '#land[data-page="agent"] .pg-home,',
  '#land[data-page="agent"] .pg-project,',
  '#land[data-page="agent"] .pg-settings,',
  '/* The fifth page, same shape. */',
  '#land[data-page="home"] .pg-fixer,',
  '#land[data-page="project"] .pg-fixer,',
  '#land[data-page="settings"] .pg-fixer,',
  '#land[data-page="agent"] .pg-fixer,',
  '#land[data-page="fixer"] .pg-home,',
  '#land[data-page="fixer"] .pg-project,',
  '#land[data-page="fixer"] .pg-settings,',
  '#land[data-page="fixer"] .pg-agent{display:none;}',
]));

/* ---- 2. the page -------------------------------------------------------- */
swap('<section class="panelbox pg-agent">', block([
  '<!-- Fake pixel art in, real pixels out. The heavy work runs in a Worker',
  '     built from the engine text below, so the page stays responsive while',
  '     four detectors argue about the grid. -->',
  '<section class="panelbox pg-fixer" id="fixer">',
  '  <h2>Fix pixels</h2>',
  '  <p class="note">Turns fake pixel art - an upscale, an AI render, a blurred or off-grid',
  '    sprite - into real pixel art at the size it was drawn at. Four independent',
  '    detectors find the grid; each cell becomes one true pixel. Retro Diffusion\'s',
  '    Pixel Art Fixer, running here. Nothing leaves your device.</p>',
  '  <div class="drop" id="fixdrop" tabindex="0" role="button" aria-label="Choose an image to fix">',
  '    <strong>Drop an image here</strong>',
  '    <span>or click to choose one \u00b7 PNG, JPG, WEBP or GIF</span>',
  '  </div>',
  '  <input type="file" id="fixfile" accept="image/png,image/jpeg,image/webp,image/gif" hidden>',
  '  <div class="agjob">',
  '    <label for="fixmode">Mode</label>',
  '    <select id="fixmode" title="Full runs every detector and arbitrates; Fast stops at the first agreement"><option value="full">Full - best answer</option><option value="fast">Fast - seconds</option></select>',
  '    <label for="fixforce">Cell size</label>',
  '    <input type="number" id="fixforce" min="0" step="0.01" value="0" style="width:84px"',
  '      title="0 finds the cell size. A number skips detection and uses that size - for when you already know it">',
  '    <button class="btn" id="fixrun" disabled>Fix it</button>',
  '    <button class="btn ghost" id="fixstop" hidden>Stop</button>',
  '  </div>',
  '  <div class="fixprog" id="fixprog" hidden><div class="fixbar"><i id="fixbar"></i></div><span class="mono" id="fixlabel"></span></div>',
  '  <p class="note mono" id="fixout"></p>',
  '  <div class="fixpair" id="fixpair" hidden>',
  '    <figure><canvas id="fixbefore"></canvas><figcaption id="fixbeforecap"></figcaption></figure>',
  '    <figure><canvas id="fixafter"></canvas><figcaption id="fixaftercap"></figcaption></figure>',
  '  </div>',
  '  <div class="btnrow" id="fixacts" hidden>',
  '    <button class="btn" id="fixopen">Open in the editor</button>',
  '    <button class="btn ghost" id="fixdl">Download the PNG</button>',
  '  </div>',
  '</section>',
  '<section class="panelbox pg-agent">',
]));

swap('.agjob{display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:6px 0;}', block([
  '.agjob{display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:6px 0;}',
  '/* The fixer\'s progress and its before/after. Both canvases are shown at',
  '   the SAME size on screen: the after is a fraction of the before in pixels',
  '   and would otherwise sit there as a thumbnail, which reads as "it shrank',
  '   my picture" rather than "it found the pixels". */',
  '.fixprog{display:flex; align-items:center; gap:10px; margin:8px 0;}',
  '.fixbar{flex:1; height:6px; border-radius:3px; background:var(--panel-2); overflow:hidden;}',
  '.fixbar i{display:block; height:100%; width:0; background:var(--accent); transition:width .15s;}',
  '.fixpair{display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:10px;}',
  '.fixpair figure{margin:0; text-align:center;}',
  '.fixpair canvas{width:100%; max-width:420px; image-rendering:pixelated; background:',
  '  repeating-conic-gradient(#ffffff10 0 25%,transparent 0 50%) 0 0/16px 16px; border:1px solid var(--line); border-radius:8px;}',
  '.fixpair figcaption{font-size:12px; color:var(--muted); margin-top:5px;}',
  '@media (max-width:640px){ .fixpair{grid-template-columns:1fr;} }',
]));

/* ---- 3. the engine text, not run on the main thread -------------------- */
{
  const end = text.lastIndexOf('</script>');
  if (end < 0) throw new Error('no script end');
  text = text.slice(0, end + '</script>'.length) + NL + block([
    '<!-- Retro Diffusion\'s Pixel Art Fixer, ported to JavaScript. type="text/plain"',
    '     so the browser does NOT execute it here: the Fix pixels tab reads this',
    '     text and runs it in a Worker, off the main thread. tools/text-core-check',
    '     style provenance is in the bundle\'s own header. -->',
    '<script id="pfcore" type="text/plain">',
  ]) + NL + bundle.replace(/\r?\n/g, NL).replace(/\s+$/, '') + NL + '</script>' + text.slice(end + '</script>'.length);
}

/* ---- 4. the tab's own logic --------------------------------------------- */
swap('const PAGES=["home","project","settings","agent","fixer"];', block([
  'const PAGES=["home","project","settings","agent","fixer"];',
  '',
  '/* ---- the Fix pixels tab ---------------------------------------------------',
  '',
  '   One image at a time: decode it, hand the bytes to a Worker running the',
  '   engine, show progress, show the answer beside the question, and only then',
  '   offer to do something with it. */',
  'const FIX={name:"", src:null, out:null, worker:null};',
  'const FIX_MAX_PIXELS=4000000, FIX_MIN_SIDE=16;',
  'function fixSay(m){ const el=$("fixout"); if(el) el.textContent=m; }',
  'function fixProgress(f,label){',
  '  const p=$("fixprog"), b=$("fixbar"), l=$("fixlabel"); if(!p) return;',
  '  p.hidden=(f==null);',
  '  if(b) b.style.width=Math.round(Math.max(0,Math.min(1,f||0))*100)+"%";',
  '  if(l) l.textContent=label||"";',
  '}',
  '/* The engine text, run where it cannot freeze the page. Built once per',
  '   run and terminated after, so Stop is a real stop and not a request. */',
  'function fixWorker(){',
  '  const el=$("pfcore"); if(!el||!el.textContent.trim()) throw new Error("The fixer engine is not in this page.");',
  '  const glue=[',
  '    "self.onmessage=function(ev){ const m=ev.data;",',
  '    "  try{",',
  '    "    const r=PF.process(m.data,m.width,m.height,{mode:m.mode,forceStep:m.forceStep,",',
  '    "      onProgress:function(f,l){ postMessage({progress:f,label:l}); }});",',
  '    "    postMessage({done:{cols:r.cols,rows:r.rows,stepX:r.stepX,stepY:r.stepY,consensus:r.consensus,",',
  '    "      confidence:r.confidence,width:r.width,height:r.height,data:r.data}},[r.data.buffer]);",',
  '    "  }catch(e){ postMessage({error:String(e&&e.message||e)}); }",',
  '    "};"].join("\\n");',
  '  const url=URL.createObjectURL(new Blob([el.textContent,"\\n",glue],{type:"text/javascript"}));',
  '  const w=new Worker(url); w._url=url; return w;',
  '}',
  'async function fixLoad(file){',
  '  if(!file||!/^image\\//.test(file.type||"")){ fixSay("That is not an image."); return; }',
  '  let bm; try{ bm=await createImageBitmap(file); }catch(_){ fixSay("That image could not be decoded."); return; }',
  '  const W=bm.width, H=bm.height;',
  '  if(Math.min(W,H)<FIX_MIN_SIDE){ fixSay("Too small - the shorter side has to be at least "+FIX_MIN_SIDE+" pixels."); return; }',
  '  if(W*H>FIX_MAX_PIXELS){ fixSay("Too big - "+(W*H/1e6).toFixed(1)+" megapixels, and the limit is "+(FIX_MAX_PIXELS/1e6)+"."); return; }',
  '  const c=document.createElement("canvas"); c.width=W; c.height=H;',
  '  const g=c.getContext("2d"); g.drawImage(bm,0,0);',
  '  FIX.src={data:g.getImageData(0,0,W,H).data, width:W, height:H};',
  '  FIX.name=String(file.name||"image").replace(/\\.[^.]+$/,"");',
  '  FIX.out=null;',
  '  const b=$("fixbefore"); b.width=W; b.height=H; b.getContext("2d").drawImage(bm,0,0);',
  '  $("fixbeforecap").textContent=FIX.name+" \\u00b7 "+W+"\\u00d7"+H+" as it came in";',
  '  const a=$("fixafter"); a.width=W; a.height=H; a.getContext("2d").clearRect(0,0,W,H);',
  '  $("fixaftercap").textContent="";',
  '  $("fixpair").hidden=false; $("fixacts").hidden=true;',
  '  $("fixrun").disabled=false;',
  '  fixSay(W+"\\u00d7"+H+" pixels. Press Fix it.");',
  '}',
  '/* Progress is a promise from the engine, not a guess from a timer, and the',
  '   answer is shown beside the question at the same size on screen. */',
  'function fixRun(){',
  '  if(!FIX.src){ fixSay("Choose an image first."); return Promise.resolve(null); }',
  '  fixStop();',
  '  const mode=$("fixmode").value==="fast"?"fast":"full";',
  '  const forced=+$("fixforce").value||0;',
  '  const src=FIX.src;',
  '  $("fixrun").disabled=true; $("fixstop").hidden=false; $("fixacts").hidden=true;',
  '  fixProgress(0,"starting"); fixSay("");',
  '  return new Promise(resolve=>{',
  '    let w;',
  '    try{ w=fixWorker(); }catch(e){ fixSay(e.message); fixProgress(null); $("fixrun").disabled=false; $("fixstop").hidden=true; resolve(null); return; }',
  '    FIX.worker=w;',
  '    const t0=performance.now();',
  '    w.onmessage=ev=>{',
  '      const m=ev.data;',
  '      if(m.progress!=null){ fixProgress(m.progress,m.label); return; }',
  '      if(m.error){ fixSay("The fixer could not do this one: "+m.error); fixDone(w); resolve(null); return; }',
  '      if(m.done){',
  '        const r=m.done; FIX.out=r;',
  '        const a=$("fixafter"); a.width=r.width; a.height=r.height;',
  '        const im=a.getContext("2d").createImageData(r.width,r.height); im.data.set(r.data); a.getContext("2d").putImageData(im,0,0);',
  '        const secs=((performance.now()-t0)/1000).toFixed(1);',
  '        $("fixaftercap").textContent=r.width+"\\u00d7"+r.height+" real pixels \\u00b7 cell "+(+r.stepX).toFixed(2)+(Math.abs(r.stepX-r.stepY)>0.01?"\\u00d7"+(+r.stepY).toFixed(2):"")+" px";',
  '        fixSay((r.confidence||"")+" confidence ("+(r.consensus||"?")+") \\u00b7 "+secs+"s");',
  '        $("fixacts").hidden=false;',
  '        fixDone(w); resolve(r);',
  '      }',
  '    };',
  '    w.onerror=e=>{ fixSay("The fixer stopped: "+(e.message||"error")); fixDone(w); resolve(null); };',
  '    /* A COPY of the bytes goes across, so the source survives a second run.',
  '       Transferring the original would leave FIX.src holding a detached',
  '       buffer of length zero. */',
  '    const copy=new Uint8ClampedArray(src.data);',
  '    w.postMessage({data:copy, width:src.width, height:src.height, mode, forceStep:forced>0?forced:null},[copy.buffer]);',
  '  });',
  '}',
  'function fixDone(w){',
  '  if(w){ try{ w.terminate(); }catch(_){ } try{ URL.revokeObjectURL(w._url); }catch(_){ } }',
  '  if(FIX.worker===w) FIX.worker=null;',
  '  fixProgress(null); $("fixrun").disabled=!FIX.src; $("fixstop").hidden=true;',
  '}',
  'function fixStop(){ if(FIX.worker){ fixDone(FIX.worker); fixSay("Stopped."); } }',
  '/* Into the editor by the same door a dropped PNG uses, so everything the',
  '   editor does on open - the palette, the grid guess, the draft - happens',
  '   to this exactly as it would to a file. */',
  'function fixOpen(){',
  '  const r=FIX.out; if(!r){ fixSay("Nothing fixed yet."); return; }',
  '  if(!mayUse()) return;',
  '  const d=new Uint8ClampedArray(r.data);',
  '  fileName=FIX.name+"-fixed.png";',
  '  startEditor(d,r.width,r.height,r.width,r.height,palette(d,r.width*r.height,24,64),false);',
  '}',
  'function fixDownload(){',
  '  const r=FIX.out; if(!r){ fixSay("Nothing fixed yet."); return; }',
  '  $("fixafter").toBlob(b=>{',
  '    const a=document.createElement("a"); a.href=URL.createObjectURL(b); a.download=FIX.name+"-fixed.png"; a.click();',
  '    setTimeout(()=>URL.revokeObjectURL(a.href),1000);',
  '  },"image/png");',
  '}',
  '(function(){',
  '  const d=$("fixdrop"), f=$("fixfile"); if(!d||!f) return;',
  '  d.onclick=()=>f.click();',
  '  d.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); f.click(); } };',
  '  f.onchange=()=>{ if(f.files&&f.files[0]) fixLoad(f.files[0]); f.value=""; };',
  '  d.ondragover=e=>{ e.preventDefault(); d.classList.add("over"); };',
  '  d.ondragleave=()=>d.classList.remove("over");',
  '  d.ondrop=e=>{ e.preventDefault(); d.classList.remove("over"); const x=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(x) fixLoad(x); };',
  '  $("fixrun").onclick=()=>{ fixRun(); };',
  '  $("fixstop").onclick=fixStop;',
  '  $("fixopen").onclick=fixOpen;',
  '  $("fixdl").onclick=fixDownload;',
  '})();',
  '/* For an agent: the same run, as a promise of the same answer. */',
  'PB.fix=async function(o){',
  '  o=o||{};',
  '  showPage("fixer",false);',
  '  if(o.file) await fixLoad(o.file);',
  '  else if(o.data&&o.width&&o.height){',
  '    FIX.src={data:new Uint8ClampedArray(o.data), width:o.width, height:o.height}; FIX.name=o.name||"image"; FIX.out=null;',
  '    const b=$("fixbefore"); b.width=o.width; b.height=o.height;',
  '    const im=b.getContext("2d").createImageData(o.width,o.height); im.data.set(FIX.src.data); b.getContext("2d").putImageData(im,0,0);',
  '    $("fixpair").hidden=false; $("fixrun").disabled=false;',
  '  }',
  '  if(!FIX.src) return {ok:false, why:"nothing to fix"};',
  '  if(o.mode) $("fixmode").value=o.mode;',
  '  if(o.forceStep!=null) $("fixforce").value=o.forceStep;',
  '  const r=await fixRun();',
  '  if(!r) return {ok:false, why:$("fixout").textContent};',
  '  if(o.open) fixOpen();',
  '  return {ok:true, cols:r.cols, rows:r.rows, stepX:r.stepX, stepY:r.stepY, consensus:r.consensus, confidence:r.confidence, width:r.width, height:r.height};',
  '};',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);
const markup = text.slice(0, text.indexOf('<script'));

/* THE MAIN SCRIPT IS STILL THE FIRST AND THE ONLY ONE THE KIT SEES; the
   engine sits after it as text. If scriptOf ever picked up the bundle, every
   patch's checks would be reading the wrong program. */
if (script.indexOf('PF.process') >= 0 && script.indexOf('function fixWorker') < 0)
  throw new Error('the engine text landed inside the main script');
if (text.indexOf('<script id="pfcore" type="text/plain">') < 0) throw new Error('the engine tag is missing');
if (text.indexOf('<script id="pfcore" type="text/plain">') < text.lastIndexOf('<script>'))
  throw new Error('the engine tag comes before the main script');
// eslint-disable-next-line no-new-func
new Function(bundle);   /* the bundle parses on its own, which the worker will need */

/* THE PAGE IS WIRED LIKE THE OTHER FOUR. */
if (code.indexOf('const PAGES=["home","project","settings","agent","fixer"];') < 0) throw new Error('fixer is not a page');
for (const id of ['fixer', 'fixdrop', 'fixfile', 'fixmode', 'fixforce', 'fixrun', 'fixstop', 'fixprog', 'fixbar',
  'fixlabel', 'fixout', 'fixpair', 'fixbefore', 'fixafter', 'fixacts', 'fixopen', 'fixdl', 'pfcore'])
  if (text.split('id="' + id + '"').length !== 2) throw new Error(id + ' is not in the page exactly once');
const css = text.slice(0, text.indexOf('</style>'));
for (const p of ['home', 'project', 'settings', 'agent'])
  if (css.indexOf('#land[data-page="' + p + '"] .pg-fixer') < 0) throw new Error('the fixer page shows on ' + p);
for (const p of ['home', 'project', 'settings', 'agent'])
  if (css.indexOf('#land[data-page="fixer"] .pg-' + p) < 0) throw new Error(p + ' shows on the fixer page');
if (markup.split('data-page="fixer"').length !== 2) throw new Error('the tab is not in the nav exactly once');

/* THE WORK IS OFF THE MAIN THREAD, and the source bytes are copied across
   rather than handed over. */
if (code.indexOf('new Worker(url)') < 0) throw new Error('the engine would run on the main thread');
if (code.indexOf('const copy=new Uint8ClampedArray(src.data);') < 0) throw new Error('the source buffer would be detached by the transfer');
/* AND OPENING GOES THROUGH THE EDITOR\'S OWN DOOR. */
if (code.indexOf('startEditor(d,r.width,r.height,r.width,r.height,palette(d,r.width*r.height,24,64),false);') < 0)
  throw new Error('open does not use startEditor the way a dropped file does');

fs.writeFileSync(FILE, text);
console.log('index.html ' + before.length + ' -> ' + text.length + ' (+' + (text.length - before.length) + ', bundle ' + bundle.length + ')');
