/* A LINKED SOURCE, SO THE AGENT STOPS FORKING THE SITE.

   Codex has been running the trait pass on a local integration copy of this
   site pinned at f8339161, re-downloading and re-integrating every time it
   moves. The reason a separate copy exists at all is small: this site has no
   way to open a NAMED file. A person clicks the drop zone and picks one from a
   dialog; an agent cannot, so he wrote local-source-import.js to put the entry
   back, and everything else followed from having a fork to put it in.

   This is that entry, native. Stage a PNG in ./imports and open

     index.html?source=/imports/whatever.png&name=Whatever

   and the file is fetched and offered, exactly as if it had been dropped.

   THE RULES ARE HIS, AND THEY ARE THE POINT. Same origin only, /imports/ only,
   one path segment, .png only, no query, no hash, no credentials in the URL,
   25 MB cap, and the response has to actually be image/png. A page that will
   fetch any path somebody puts in a link is a page that reads files on behalf
   of whoever wrote the link.

   AND IT DOES NOT OPEN THE ART BY ITSELF. The link stages the file and says so;
   opening is still a press, because "entering the editor does not automatically
   recolour, outline or remove a base colour" is the workflow rule this whole
   pass is built on. PB.openLinked() is the same press for an agent, in one
   call, and it goes to Open as it is - the choice that leaves every pixel
   where it is.
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

/* ---- 1. the bar that says one is waiting -------------------------------- */
swap(block([
  '  <div class="drop pg-home" id="drop" tabindex="0" role="button" aria-label="Choose a PNG to open">',
]), block([
  '  <div class="restore pg-home" id="linkbar" hidden>',
  '    <p><strong>Linked trait ready:</strong> <span id="linkname" class="mono"></span></p>',
  '    <div class="btnrow">',
  '      <button class="btn" id="linkopen">Open as it is</button>',
  '      <button class="btn ghost" id="linkoptions">Open with options</button>',
  '      <button class="btn ghost" id="linkdrop">Forget it</button>',
  '    </div>',
  '  </div>',
  '  <div class="drop pg-home" id="drop" tabindex="0" role="button" aria-label="Choose a PNG to open">',
]));

/* ---- 2. the raw choice gets a name, so it can be pressed ---------------- */
swap(block([
  "    const raw=document.createElement('button');",
  "    raw.className='big'+((B||opaque)?'':' primary');",
]), block([
  "    const raw=document.createElement('button');",
  "    /* Named so it can be pressed by something other than a mouse: the linked",
  "       entry opens straight to this choice, and a test has to reach it too. */",
  "    raw.id='openraw';",
  "    raw.className='big'+((B||opaque)?'':' primary');",
]));

/* ---- 3. resolving and fetching a linked source -------------------------- */
swap(block([
  'function load(file){',
]), block([
  '/* ================= a linked source ============================== */',
  '/* WHAT A LINK IS ALLOWED TO NAME. Ported from the integration copy\'s',
  '   local-source-import.js, rules unchanged, because they are the part that',
  '   matters: a page that fetches whatever path a link names is a page that',
  '   reads files on behalf of whoever wrote the link.',
  '',
  '   Same origin, /imports/ only, one path segment, .png only, and nothing',
  '   else in the URL at all - no query, no hash, no credentials. */',
  'const LINK_DIR=/^\\/imports\\/[a-z0-9._-]+\\.png$/i;',
  'const LINK_MAX=25*1024*1024;',
  'function linkResolve(href){',
  '  let page; try{ page=new URL(href); }catch(_){ return null; }',
  '  const source=page.searchParams.get("source");',
  '  if(!source) return null;',
  '  let target; try{ target=new URL(source,page); }catch(_){ throw Error("That link does not name a file on this site."); }',
  '  if(target.origin!==page.origin||!LINK_DIR.test(target.pathname)',
  '    ||target.search||target.hash||target.username||target.password)',
  '    throw Error("A linked source has to be a PNG staged in this site\'s imports folder.");',
  '  const named=page.searchParams.get("name")||target.pathname.split("/").pop();',
  '  return {url:target.href, name:String(named).replace(/[\\\\/]/g,"-")};',
  '}',
  '/* Fetched, checked, and handed over as a File - the same thing the drop zone',
  '   produces, so nothing downstream needs to know where it came from. */',
  'async function linkFetch(link){',
  '  const res=await fetch(link.url,{credentials:"same-origin",redirect:"error",cache:"no-store"});',
  '  if(!res.ok) throw Error("That linked file could not be loaded.");',
  '  const type=String(res.headers.get("Content-Type")||"").split(";")[0];',
  '  if(type!=="image/png") throw Error("A linked source has to be a PNG.");',
  '  if(Number(res.headers.get("Content-Length"))>LINK_MAX) throw Error("That file is over 25 MB.");',
  '  const blob=await res.blob();',
  '  if(blob.size>LINK_MAX) throw Error("That file is over 25 MB.");',
  '  return new File([blob],link.name.replace(/\\.png$/i,"")+".png",{type:"image/png"});',
  '}',
  '/* Staged, not opened. Entering the editor does not recolour, outline or',
  '   remove a base colour, and a link that did any of that by arriving would',
  '   break the one rule this whole review pass rests on. */',
  'let LINKED=null;',
  'function linkShow(){',
  '  const bar=$("linkbar"); if(!bar) return;',
  '  bar.hidden=!LINKED;',
  '  const n=$("linkname"); if(n) n.textContent=LINKED?LINKED.name:"";',
  '}',
  'async function linkStage(href){',
  '  let link=null;',
  '  try{ link=linkResolve(href===undefined?location.href:href); }',
  '  catch(e){ $("err").textContent=(e&&e.message)||"That link could not be read."; return null; }',
  '  if(!link) return null;',
  '  try{ LINKED={name:link.name, url:link.url, file:await linkFetch(link)}; }',
  '  catch(e){ LINKED=null; $("err").textContent=(e&&e.message)||"That linked file could not be loaded."; }',
  '  linkShow();',
  '  return LINKED;',
  '}',
  '/* The press, for something without a mouse. Opens to "as it is", which is',
  '   the choice that leaves every pixel where it is. */',
  'async function linkOpen(how){',
  '  if(!LINKED||!LINKED.file) throw Error("Nothing is linked.");',
  '  const file=LINKED.file;',
  '  load(file);',
  '  if(how==="options") return true;',
  '  /* analyse() decodes before it draws the choices, so the button is not',
  '     there yet on the tick load() returns. */',
  '  for(let i=0;i<200;i++){',
  '    const b=$("openraw");',
  '    if(b){ b.click(); return true; }',
  '    await new Promise(r=>setTimeout(r,25));',
  '  }',
  '  throw Error("The open choices did not appear.");',
  '}',
  'function load(file){',
]));

/* ---- 4. on the surface, and wired --------------------------------------- */
swap(block([
  "  jobs:[\"grids\",\"colours\"]};",
]), block([
  "  jobs:[\"grids\",\"colours\"]};",
  '/* The way in for something without a mouse. PB.linked() says what is staged,',
  '   PB.openLinked() is the press. */',
  'PB.linked=function(){ return LINKED?{name:LINKED.name, url:LINKED.url}:null; };',
  'PB.openLinked=function(how){ return linkOpen(how); };',
  'PB.stageLinked=function(href){ return linkStage(href); };',
]));

swap(block([
  '  if($("aggrids")) $("aggrids").onclick=()=>run(()=>PB.grids());',
]), block([
  '  if($("aggrids")) $("aggrids").onclick=()=>run(()=>PB.grids());',
  '  if($("linkopen")) $("linkopen").onclick=()=>linkOpen();',
  '  if($("linkoptions")) $("linkoptions").onclick=()=>linkOpen("options");',
  '  if($("linkdrop")) $("linkdrop").onclick=()=>{ LINKED=null; linkShow(); };',
  '  /* Staged on arrival, so the bar is there before anybody presses anything.',
  '     Nothing is decoded or drawn until they do. */',
  '  try{ linkStage(); }catch(_){ }',
]));

/* ---- 5. said on the agent page too --------------------------------------- */
swap(block([
  '    <p class="note mono" id="agstatus">Nothing run yet.</p>',
]), block([
  '    <div class="agjob">',
  '      <code>?source=/imports/x.png&amp;name=X</code>',
  '      <span class="note">stage a PNG from this site\'s imports folder, then',
  '        <code>PB.openLinked()</code> to open it as it is</span>',
  '    </div>',
  '    <p class="note mono" id="agstatus">Nothing run yet.</p>',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function linkResolve(href){', 'async function linkFetch(link){',
  'async function linkOpen(how){', 'PB.openLinked=function(how){',
  "raw.id='openraw';"])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* BOUNDED ON CODE, NEVER ON A COMMENT. kit.code() strips comments, so a slice
   bounded on one silently falls through to whatever the fallback was - here a
   fixed window that ran straight into linkOpen and found the load() call that
   belongs to it. This file has now paid for that four times; the rule is that
   a bound is the next declaration, and a bound that is not found throws. */
const bound = (from, to) => {
  const a = code.indexOf(from);
  const b = code.indexOf(NL + to, a);
  if (a < 0 || b < 0) throw new Error('could not bound ' + from.slice(0, 40));
  return code.slice(a, b);
};

/* EVERY RULE ON WHAT A LINK MAY NAME. Dropping any one of them turns this into
   a page that reads files chosen by whoever wrote the link. */
const resolve = bound('function linkResolve(href){', 'async function linkFetch(link){');
for (const guard of ['target.origin!==page.origin', 'LINK_DIR.test(target.pathname)',
  'target.search', 'target.hash', 'target.username', 'target.password'])
  if (resolve.indexOf(guard) < 0) throw new Error('a link guard is missing: ' + guard);
if (code.indexOf('const LINK_DIR=/^\\/imports\\/[a-z0-9._-]+\\.png$/i;') < 0)
  throw new Error('the allowed path shape changed');

/* AND ON WHAT COMES BACK. A path check says what was asked for, not what
   arrived: the response still has to be a PNG and still has to fit. */
const fetchIt = bound('async function linkFetch(link){', 'let LINKED=null;');
for (const guard of ['redirect:"error"', 'type!=="image/png"', 'blob.size>LINK_MAX'])
  if (fetchIt.indexOf(guard) < 0) throw new Error('a response guard is missing: ' + guard);

/* IT STAGES, IT DOES NOT OPEN. The whole review workflow rests on entering the
   editor changing nothing by itself. */
const stage = bound('async function linkStage(href){', 'async function linkOpen(how){');
if (stage.indexOf('load(') >= 0 || stage.indexOf('analyse(') >= 0)
  throw new Error('arriving with a link opens the artwork by itself');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
