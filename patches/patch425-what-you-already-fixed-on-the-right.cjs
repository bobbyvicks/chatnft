/* WHAT YOU ALREADY FIXED WAS GONE THE MOMENT YOU FIXED THE NEXT THING.

   "show the previously edited work on the right side of the screen and have
   (last edited on main but for fix pixels)"

   The batch grid is emptied at the start of every run - fixTilesClear revokes
   its thumbnails and wipes the tiles - and a single image simply replaces the
   one before it. So there was no way to look back at the last thing you did,
   and the only record that a run had happened at all was a sentence saying
   how many.

   The main page already has the answer to this in Last edited. This is that,
   for the fixer: a rail down the right side listing what has been fixed this
   session, newest first, each one a button that opens it in the editor.

   IT SURVIVES THE NEXT RUN, which is the whole point, so it cannot share the
   grid's thumbnails - those are revoked when the grid is cleared. The rail
   makes its own URL from the same thumbnail bytes and revokes it when the
   entry falls off the end.

   CAPPED AT 24. Each entry holds the fixed PNG so it can still be opened, and
   the shelf has already asked this browser for 2GB of canvas once. 24 of them
   at 1280 is a few megabytes of compressed bytes and no decoded canvases -
   the thumbnails are the 160px ones the grid already made.

   The layout goes to two columns at 1100 and up. Below that the rail would
   leave the previews narrower than they were before any of this, so it goes
   under instead. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;
const X = String.fromCharCode(92) + 'u00d7';

/* ---- the two columns ----------------------------------------------- */
{
  const at = kit.only(L, l => l === '#land[data-page="fixer"] .panelbox{width:min(2100px,96vw);}',
    'the fixer page width');
  kit.replace(L, { start: at, end: at }, [
    '#land[data-page="fixer"] .panelbox{width:min(2100px,96vw);}',
    '/* THE WORK ON THE LEFT, WHAT YOU ALREADY FIXED ON THE RIGHT. One column',
    '   below 1100: a 300px rail there would leave the previews narrower than',
    '   they were before the page was widened at all, which is a worse trade',
    '   than putting the list underneath. */',
    '.fixcols{display:grid; grid-template-columns:minmax(0,1fr); gap:18px;',
    '  align-items:start;}',
    '@media (min-width:1100px){ .fixcols{grid-template-columns:minmax(0,1fr) 300px;} }',
    '.fixrail{border:1px solid var(--line); border-radius:11px;',
    '  background:var(--panel-2); padding:12px 12px 4px;}',
    '/* Sticky only where it is a column - stuck to the top of a page it is',
    '   sitting UNDER is a box that will not scroll away. */',
    '@media (min-width:1100px){ .fixrail{position:sticky; top:12px;',
    '  max-height:calc(100dvh - 24px); overflow-y:auto;} }',
    '.fixrail h3{font-size:12px; text-transform:uppercase; letter-spacing:.09em;',
    '  color:var(--good); margin:0;}',
    '.fixrail .railhead{display:flex; align-items:baseline; gap:8px;',
    '  margin-bottom:4px;}',
    '.fixrail .railhead .count{font-size:11.5px; color:var(--dim);}',
    '/* A row is a button, because every one of them does something. */',
    '.frow{width:100%; text-align:left; font:inherit; color:inherit;',
    '  background:none; border:none; border-bottom:1px solid var(--line);',
    '  cursor:pointer; padding:6px 0;}',
    '.frow:last-child{border-bottom:none;}',
    '.frow:hover .rname{color:var(--accent);}',
    '.fixrail .rrow img{width:44px; height:44px; flex:none; border-radius:6px;',
    '  background:var(--panel); image-rendering:pixelated; object-fit:contain;}',
    '.fixrail .rsize{color:var(--dim); font-size:11.5px; white-space:nowrap;}',
  ]);
}

/* ---- the markup ---------------------------------------------------- */
{
  const open = kit.only(L,
    l => l === '  <div class="drop" id="fixdrop" tabindex="0" role="button" aria-label="Choose an image to fix">',
    'the start of the fixer work');
  kit.replace(L, { start: open, end: open - 1 }, [
    '  <!-- TWO COLUMNS. The inner indentation is left as it was: reflowing',
    '       sixty lines to move them two spaces would bury the change. -->',
    '  <div class="fixcols">',
    '  <div class="fixwork">',
  ]);
  const stop = kit.only(L, l => l === '      <button class="btn ghost" id="fixbatchstop" hidden>Stop</button>',
    'the end of the batch buttons');
  if (L[stop + 1] !== '    </div>' || L[stop + 2] !== '  </div>' || L[stop + 3] !== '</section>')
    throw new Error('the fixer section does not close the way this expects');
  kit.replace(L, { start: stop + 2, end: stop + 2 }, [
    '  </div>',
    '  </div>',
    '  <!-- LAST EDITED, FOR THE FIXER. Hidden until there is something in it,',
    '       the same as the list it is modelled on. -->',
    '  <aside class="fixrail" id="fixrail" hidden>',
    '    <div class="railhead"><h3>Last fixed</h3>',
    '      <span class="count" id="fixrecentcount"></span></div>',
    '    <div id="fixrecentbody"></div>',
    '  </aside>',
    '  </div>',
  ]);
}

/* ---- the list ------------------------------------------------------ */
{
  const at = kit.only(L, l => l === 'function fixTile(f){', 'the batch tile');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* WHAT HAS BEEN FIXED THIS SESSION, newest first.',
    '',
    '   Not the batch grid: that is emptied and its thumbnails revoked at the',
    '   start of every run, and surviving the next run is the entire point of',
    '   this. So the rail owns its own URL for the same thumbnail bytes and',
    '   revokes it when the entry falls off the end.',
    '',
    '   24 because each entry keeps the fixed PNG so it can still be opened. As',
    '   bytes, not as a canvas - a decoded 1280 is 6.5MB and this page has',
    '   asked the browser for 2GB of canvas once already. */',
    'const FIX_RECENT_MAX=24;',
    'let fixRecent=[];',
    'function fixRecentAdd(f,thumbBlob){',
    '  if(!f||!f.data) return;',
    '  let url="";',
    '  try{ url=thumbBlob?URL.createObjectURL(thumbBlob):""; }catch(_){ }',
    '  fixRecent.unshift({name:f.name, data:f.data, cells:f.cells,',
    '    w:f.w, h:f.h, tw:f.tw, th:f.th, url:url, at:Date.now()});',
    '  while(fixRecent.length>FIX_RECENT_MAX){',
    '    const gone=fixRecent.pop();',
    '    if(gone&&gone.url) try{ URL.revokeObjectURL(gone.url); }catch(_){ }',
    '  }',
    '  fixRecentRender();',
    '}',
    'function fixRecentRender(){',
    '  const rail=$("fixrail"), body=$("fixrecentbody"), count=$("fixrecentcount");',
    '  if(!rail||!body) return;',
    '  rail.hidden=!fixRecent.length;',
    '  if(count) count.textContent=fixRecent.length>=FIX_RECENT_MAX',
    '    ? "the last "+FIX_RECENT_MAX : String(fixRecent.length);',
    '  body.innerHTML="";',
    '  for(const e of fixRecent){',
    '    const b=document.createElement("button");',
    '    b.className="rrow frow"; b.type="button";',
    '    b.title="Open "+e.name+" in the editor";',
    '    const im=document.createElement("img");',
    '    im.src=e.url; im.alt=""; im.loading="lazy";',
    '    if(e.tw) im.width=e.tw; if(e.th) im.height=e.th;',
    '    const nm=document.createElement("span");',
    '    nm.className="rname"; nm.textContent=e.name.split("/").pop();',
    '    const sz=document.createElement("span");',
    '    sz.className="rsize"; sz.textContent=e.w+"' + X + '"+e.h;',
    '    b.append(im,nm,sz);',
    '    b.onclick=()=>fixOpenOne(e);',
    '    body.appendChild(b);',
    '  }',
    '}',
  ]);
}

/* ---- fed by a batch ------------------------------------------------ */
{
  const at = kit.only(L, l => l === '    fixTile(fixBatchFiles[fixBatchFiles.length-1]);', 'where a batch shows a result');
  kit.replace(L, { start: at, end: at }, [
    '    fixTile(fixBatchFiles[fixBatchFiles.length-1]);',
    '    /* The thumbnail BYTES, not the URL the grid made for them - that one',
    '       is revoked when the next run clears the grid. */',
    '    fixRecentAdd(fixBatchFiles[fixBatchFiles.length-1],tb);',
  ]);
}

/* ---- and by a single run ------------------------------------------- */
{
  const at = kit.only(L, l => l === 'function fixDownload(){', 'the single download');
  kit.replace(L, { start: at, end: at - 1 }, [
    '/* ONE PICTURE FIXED IS STILL A PICTURE FIXED. A rail that only ever',
    '   listed folder runs would be empty for anyone who does them one at a',
    '   time, which is how the tab is used on a single trait. */',
    'async function fixRecentFromRun(r){',
    '  if(!r||!$("fixrail")) return;',
    '  try{',
    '    const c=fixGridCanvas(r);',
    '    const W=c.width, H=c.height;',
    '    const blob=await new Promise(res=>c.toBlob(res,"image/png"));',
    '    const t=fitSize(W,H,SHELF_THUMB);',
    '    const tc=document.createElement("canvas"); tc.width=t.w; tc.height=t.h;',
    '    const tg=tc.getContext("2d"); tg.imageSmoothingEnabled=false;',
    '    tg.drawImage(c,0,0,t.w,t.h);',
    '    const tb=await new Promise(res=>tc.toBlob(res,"image/png"));',
    '    tc.width=1; tc.height=1; c.width=1; c.height=1;',
    '    fixRecentAdd({name:(FIX.name||"image")+"-fixed.png",',
    '      data:new Uint8Array(await blob.arrayBuffer()),',
    '      cells:r.width, w:W, h:H, tw:t.w, th:t.h}, tb);',
    '  }catch(_){ }',
    '}',
  ]);
  const run = kit.inFunction(L, 'function fixRun(){');
  const done = kit.only(L, l => l === '        const r=fixStampMeasured(m.done); fixShow(r);',
    'where the run takes its result', run);
  kit.replace(L, { start: done, end: done }, [
    '        const r=fixStampMeasured(m.done); fixShow(r);',
    '        fixRecentFromRun(r);',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  /* THE RAIL IS ITS OWN COLUMN, and the work is in the other one. */
  if (!/<div class="fixcols">/.test(text) || !/<div class="fixwork">/.test(text))
    throw new Error('the two columns are not there');
  if (!/<aside class="fixrail" id="fixrail" hidden>/.test(text))
    throw new Error('the rail is not on the page');
  /* AND IT DOES NOT SHARE THE GRID'S THUMBNAILS, which are revoked. */
  const add = kit.inFunction(codeLines, 'function fixRecentAdd(f,thumbBlob){');
  const ab = codeLines.slice(add.start, add.end + 1).join('\n');
  if (!/URL\.createObjectURL\(thumbBlob\)/.test(ab))
    throw new Error('the rail is borrowing a URL somebody else revokes');
  if (!/URL\.revokeObjectURL\(gone\.url\)/.test(ab))
    throw new Error('an entry that falls off the end leaks its thumbnail');
  if (!/while\(fixRecent\.length>FIX_RECENT_MAX\)/.test(ab))
    throw new Error('the list grows without a cap');
  /* Fed from BOTH paths, or it is empty for half the people using the tab. */
  const bat = kit.inFunction(codeLines, 'async function fixBatch(files){');
  if (!/fixRecentAdd\(fixBatchFiles\[fixBatchFiles\.length-1\],tb\)/
    .test(codeLines.slice(bat.start, bat.end + 1).join('\n')))
    throw new Error('a batch does not reach the rail');
  const one = kit.inFunction(codeLines, 'function fixRun(){');
  if (!/fixRecentFromRun\(r\)/.test(codeLines.slice(one.start, one.end + 1).join('\n')))
    throw new Error('a single run does not reach the rail');
  /* And the grid still works - this adds a list, it does not replace one. */
  if (!/function fixTile\(f\)\{/.test(codeLines.join('\n')))
    throw new Error('the batch grid was removed rather than added to');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
