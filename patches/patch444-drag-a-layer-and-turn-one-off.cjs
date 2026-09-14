/* GRAB A LAYER AND DRAG IT, AND TURN ONE OFF FROM THE SAME ROW.

   "i asked before about having it so that i could just grab and drag a layer
   (for making glasses go above skins and skins above background etc, rn it
   lags so much when you click one of the arrow that its a 20 minute job to
   change them around, also make it so that you can hide layers, would be
   nice so that the unsorted ones arent always on top of everything"

   ONE PLACE AT A TIME WAS THE WHOLE PROBLEM. The arrows move a layer by one,
   and each press is its own write and its own re-render. Crossing a list of
   nine is eight presses, and the row moves out from under the cursor on
   every one of them, so it is eight presses you have to re-aim between.
   Doing that for four layers is the twenty minutes.

   A drag is one gesture and one write, whatever distance it covers.

   WHAT I COULD NOT REPRODUCE, said plainly because it shapes what is here.
   I could not make a local reorder slow: 324 traits, 1.5 GB of blobs, and a
   press still cost about 100ms - IndexedDB hands back blob references
   without reading the bytes, so the size of the project is not the cost. The
   one path I cannot measure from here is a GROUP project, where saveLayers
   awaited a PATCH to the server BEFORE repainting - so every press waited on
   a round trip before the list moved. That is fixed below on its own merit:
   the paint does not wait on the network any more. But this patch does not
   claim to have measured the lag being reported, and the drag is what
   removes the class either way - one write instead of dozens.

   POINTER EVENTS, NOT THE DRAG-AND-DROP API. HTML5 dnd does not fire on
   touch at all, and this panel is reachable on a phone. touch-action:none on
   the handle is the other half of that: without it the browser takes the
   gesture as a scroll and the row never moves.

   THE ARROWS STAY. They are the keyboard path and the one that works when a
   pointer is not precise, and a drag handle is not a substitute for either.

   AND A SET CAN BE TURNED OFF FROM ITS ROW. That already existed - on the
   shelf headings, as "turn off" - but only on a heading that has traits
   under it and nowhere near the order it is about. The same HIDDEN_LAYERS
   set, the same saveLayers, so there is one meaning of a set being off and
   both controls show it; what is new is that it is next to the thing you are
   looking at when you want it. unsorted is last in the draw order and so
   sits in front of everything, which is what prompted it. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the paint stops waiting on the network ---------------------- */
{
  const at = kit.only(L, l => l === '  const sig=LAYERS.join("\\u0000");', 'the layer signature');
  if (L[at + 1] !== '  if(!activeWs){ sharedLayerSig=null; await renderShelf(); return true; }'
    || L[at + 2] !== '  if(sig===sharedLayerSig){ await renderShelf(); return true; }')
    throw new Error('saveLayers is not shaped the way this expects');
  kit.replace(L, { start: at, end: at + 2 }, [
    '  const sig=LAYERS.join("\\u0000");',
    '  /* THE PAINT FIRST, THE GROUP SECOND. All three ways out of here ended',
    '     in the same renderShelf, and on the one that talks to the server it',
    '     came AFTER the round trip - so in a group the list did not move until',
    '     the PATCH came back, on every single press. What is on screen is a',
    '     fact about this browser and the write above has already happened; the',
    '     send is still awaited, so a caller can still say it did not land. */',
    '  await renderShelf();',
    '  if(!activeWs){ sharedLayerSig=null; return true; }',
    '  if(sig===sharedLayerSig) return true;',
  ]);
  /* AND THE ONE AT THE FAR END GOES. It was the third way out of the same
     render; leaving it would paint twice per change, which on a shelf of 320
     is the cost this patch is about, doubled. */
  const tail = kit.near(L, '  await renderShelf();', 1, '  return shared;',
    'the render after the send');
  kit.replace(L, { start: tail, end: tail }, []);
}

/* ---- 2. the drag itself --------------------------------------------- */
{
  const at = kit.only(L, l => l === 'function buildLayerPanel(items){', 'the layer panel');
  kit.replace(L, { start: at, end: at }, [
    '/* DRAGGING ONE LAYER PAST THE OTHERS.',
    '',
    '   The rows carry the order and the DOM is where it is rearranged while',
    '   the gesture is happening - LAYERS is written once, at the end, from',
    '   what the rows ended up as. Nothing is saved mid-drag: a reorder that',
    '   wrote on every crossing would be the arrows again with extra steps.',
    '',
    '   Pointer events rather than the drag-and-drop API, which never fires on',
    '   touch.',
    '',
    '   THE LISTENERS GO ON THE WINDOW, AND THERE IS NO setPointerCapture.',
    '   That was the first version and it is wrong in a way worth writing',
    '   down: a capture is released the moment its element leaves the',
    '   document, and reordering moves the row - handle and all - in the DOM.',
    '   Measured, dragging a layer the length of the panel: the row moved',
    '   exactly ONE place and then went deaf, because the first insertBefore',
    '   released the capture the rest of the gesture depended on. A window',
    '   listener does not care where the row went. */',
    'let layerDrag=null;',
    'function layerDragStart(e,row){',
    '  if(e.button!==undefined&&e.button>0) return;',
    '  /* Or the browser takes it as a scroll or a text selection. */',
    '  e.preventDefault();',
    '  const body=$("layerbody"); if(!body) return;',
    '  layerDrag={row:row, body:body, moved:false, id:e.pointerId, move:null, end:null};',
    '  row.classList.add("dragging");',
    '  layerDrag.move=ev=>layerDragMove(ev);',
    '  layerDrag.end=ev=>layerDragEnd(ev);',
    '  window.addEventListener("pointermove",layerDrag.move,true);',
    '  window.addEventListener("pointerup",layerDrag.end,true);',
    '  window.addEventListener("pointercancel",layerDrag.end,true);',
    '}',
    '/* One finger at a time: a second pointer landing mid-drag would otherwise',
    '   steer the row the first one is holding. */',
    'function layerDragMine(e){',
    '  return !layerDrag || layerDrag.id===undefined || e.pointerId===undefined',
    '    || e.pointerId===layerDrag.id;',
    '}',
    '/* The row moves when the pointer passes the MIDDLE of a neighbour, not',
    '   its edge: on edges a row swaps back and forth the whole way across a',
    '   boundary, because moving it puts the edge under the pointer again. */',
    'function layerDragMove(e){',
    '  if(!layerDrag||!layerDragMine(e)) return;',
    '  const rows=[...layerDrag.body.querySelectorAll(".lrow")];',
    '  const cur=rows.indexOf(layerDrag.row);',
    '  if(cur<0) return;',
    '  const y=e.clientY;',
    '  for(let i=0;i<rows.length;i++){',
    '    if(i===cur) continue;',
    '    const b=rows[i].getBoundingClientRect();',
    '    const mid=b.top+b.height/2;',
    '    if(i<cur&&y<mid){ layerDrag.body.insertBefore(layerDrag.row,rows[i]); layerDrag.moved=true; return; }',
    '    if(i>cur&&y>mid){ layerDrag.body.insertBefore(layerDrag.row,rows[i].nextSibling); layerDrag.moved=true; return; }',
    '  }',
    '}',
    'async function layerDragEnd(e){',
    '  if(!layerDragMine(e)) return;',
    '  const d=layerDrag; layerDrag=null;',
    '  if(!d) return;',
    '  window.removeEventListener("pointermove",d.move,true);',
    '  window.removeEventListener("pointerup",d.end,true);',
    '  window.removeEventListener("pointercancel",d.end,true);',
    '  d.row.classList.remove("dragging");',
    '  /* A press that went nowhere is not a reorder, and writing on one would',
    '     put a save behind every stray tap on the handle. */',
    '  if(!d.moved) return;',
    '  const shown=[...d.body.querySelectorAll(".lrow")].map(r=>r.dataset.layer);',
    '  /* The panel paints the FRONT at the top and LAYERS is back to front. */',
    '  const order=shown.slice().reverse();',
    '  /* REFUSED RATHER THAN WRITTEN if the rows and the list disagree - a',
    '     render that landed mid-drag would otherwise write a list missing a',
    '     layer, and the layer is what every trait id and rule is keyed on. */',
    '  const same = order.length===LAYERS.length',
    '    && order.every(n=>typeof n==="string"&&LAYERS.indexOf(n)>=0)',
    '    && new Set(order).size===order.length;',
    '  if(!same){ await renderShelf(); return; }',
    '  LAYERS=order;',
    '  if(!await saveLayers()) toast("Order changed here"+LAYERS_NOT_SHARED);',
    '}',
    'function buildLayerPanel(items){',
  ]);
}

/* ---- 3. the handle and the off switch on every row ------------------ */
{
  const fn = kit.inFunction(L, 'function buildLayerPanel(items){');
  const at = kit.only(L, l => l === '    row.className="lrow";', 'the layer row', fn);
  kit.replace(L, { start: at, end: at }, [
    '    row.className="lrow";',
    '    /* WHAT THE DRAG WRITES BACK. Read off the row at the end of the',
    '       gesture rather than captured in the handler, so a row that was',
    '       rebuilt underneath still says which layer it is. */',
    '    row.dataset.layer=name;',
    '    const off=HIDDEN_LAYERS.has(name);',
    '    if(off) row.classList.add("off");',
    '    const grip=document.createElement("button");',
    '    grip.type="button"; grip.className="lgrip";',
    '    grip.textContent=String.fromCharCode(8942)+String.fromCharCode(8942);',
    '    grip.title="Drag to move this layer in front of or behind the others";',
    '    grip.setAttribute("aria-label","Drag "+name+" to reorder");',
    '    grip.onpointerdown=e=>layerDragStart(e,row);',
  ]);
  const fn2 = kit.inFunction(L, 'function buildLayerPanel(items){');
  const ap = kit.only(L, l => l === '    row.appendChild(inp); row.appendChild(cnt);', 'the row assembly', fn2);
  kit.replace(L, { start: ap, end: ap }, [
    '    /* THE SAME SET, FROM THE ROW IT IS ABOUT. This is the shelf heading',
    '       button in the place people look when they are thinking about draw',
    '       order - one HIDDEN_LAYERS, one saveLayers, so both controls say the',
    '       same thing and neither is a second opinion. */',
    '    const eye=document.createElement("button");',
    '    eye.className="lbtn leye"+(off?" on":"");',
    '    eye.type="button";',
    '    eye.textContent=off?"off":"on";',
    '    eye.setAttribute("aria-pressed",String(off));',
    '    eye.setAttribute("aria-label",(off?"Turn on the ":"Turn off the ")+name+" set");',
    '    eye.title=off',
    '      ? "This set is off - nothing in it is drawn. Click to draw from it again."',
    '      : "Stop drawing from this set. The traits stay here and nothing is deleted.";',
    '    eye.onclick=async()=>{',
    '      if(HIDDEN_LAYERS.has(name)) HIDDEN_LAYERS.delete(name);',
    '      else HIDDEN_LAYERS.add(name);',
    '      try{ await saveLayers(); }catch(_){ toast("Could not save that"); return; }',
    '      toast(HIDDEN_LAYERS.has(name)',
    '        ? name+" is off - nothing in it will be drawn"',
    '        : name+" is on again");',
    '    };',
    '    row.appendChild(grip); row.appendChild(inp); row.appendChild(cnt);',
    '    row.appendChild(eye);',
  ]);
}

/* ---- 4. what it looks like ------------------------------------------ */
{
  const at = kit.only(L, l => l === '.lbtn[disabled]{opacity:.28; cursor:not-allowed;}', 'the layer button rule');
  kit.replace(L, { start: at, end: at }, [
    '.lbtn[disabled]{opacity:.28; cursor:not-allowed;}',
    '/* THE DRAG HANDLE. touch-action:none is not decoration: without it the',
    '   browser claims the gesture as a scroll and the row never moves on a',
    '   touch screen, which is every phone and half the tablets. 27px to match',
    '   the buttons beside it, which is over the 22px target floor. */',
    '.lgrip{width:27px; height:27px; border-radius:6px; background:var(--panel-2);',
    '  border:1px solid var(--line); color:var(--dim); font-size:12px; flex:none;',
    '  letter-spacing:1px; cursor:grab; touch-action:none; user-select:none;}',
    '.lgrip:hover{border-color:var(--accent); color:var(--ink);}',
    '.lgrip:active{cursor:grabbing;}',
    '/* The row being dragged, so it reads as picked up rather than as a',
    '   glitch while the others move around it. */',
    '.lrow.dragging{opacity:.6; background:var(--panel-2); border-radius:6px;}',
    '/* A set that is off. Dimmed rather than hidden - it is still in the draw',
    '   order and still has its traits, it is just not being drawn. */',
    '.lrow.off .lname,.lrow.off .lcount{opacity:.45;}',
    '.leye{width:auto; min-width:42px; padding:0 8px; font-size:11px;}',
    '.leye.on{border-color:var(--accent); color:var(--ink);}',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');
  /* THE DRAG IS WIRED TO A HANDLE, and the handle is on every row. */
  if (code.indexOf('grip.onpointerdown=e=>layerDragStart(e,row);') < 0)
    throw new Error('the handle does not start a drag');
  /* NO CAPTURE. It is released when the row it is on is moved in the DOM,
     which is the first thing a reorder does - the drag then went deaf after
     one place. The window listeners are what replaced it. */
  const st = kit.inFunction(codeLines, 'function layerDragStart(e,row){');
  const stBody = codeLines.slice(st.start, st.end + 1).join('\n');
  if (/setPointerCapture/.test(stBody))
    throw new Error('the drag is back on a capture the reorder destroys');
  for (const nm of ['pointermove', 'pointerup', 'pointercancel'])
    if (code.indexOf('window.addEventListener("' + nm + '"') < 0)
      throw new Error('the drag does not listen past the row moving: ' + nm);
  for (const nm of ['layerDragStart', 'layerDragMove', 'layerDragEnd', 'layerDragMine'])
    if (code.indexOf('function ' + nm + '(') < 0)
      throw new Error('no such function: ' + nm);
  /* EVERY NAME IT CALLS IS REAL. */
  for (const nm of ['saveLayers', 'renderShelf', 'buildLayerPanel', 'toast'])
    if (code.indexOf('function ' + nm + '(') < 0)
      throw new Error('no such function: ' + nm);
  if (code.indexOf('LAYERS_NOT_SHARED') < 0)
    throw new Error('the not-shared note is gone');

  /* ONE WRITE PER DRAG, not one per crossing. A saveLayers inside the move
     handler is the arrows again wearing a different gesture. */
  const mv = kit.inFunction(codeLines, 'function layerDragMove(e){');
  const mvBody = codeLines.slice(mv.start, mv.end + 1).join('\n');
  if (/saveLayers|dbPut|renderShelf/.test(mvBody))
    throw new Error('the drag writes while it is still moving');

  /* AND IT REFUSES A LIST THAT DOES NOT MATCH. Writing a short list here
     drops a layer, and the layer is in every trait id. */
  const en = kit.inFunction(codeLines, 'async function layerDragEnd(e){');
  const enBody = codeLines.slice(en.start, en.end + 1).join('\n');
  if (!/order\.length===LAYERS\.length/.test(enBody))
    throw new Error('a drag could write a list with a layer missing');
  if (!/new Set\(order\)\.size===order\.length/.test(enBody))
    throw new Error('a drag could write the same layer twice');
  if (!/const order=shown\.slice\(\)\.reverse\(\);/.test(enBody))
    throw new Error('the panel order is not turned back into the draw order');
  if (!/if\(!d\.moved\) return;/.test(enBody))
    throw new Error('a tap that moved nothing would still write');
  /* AND THE WINDOW LISTENERS COME OFF. Three left on per drag is a page that
     reorders layers whenever the mouse moves, forever. */
  if ((enBody.match(/window\.removeEventListener\(/g) || []).length !== 3)
    throw new Error('the drag leaves its listeners on the window');
  /* Removed BEFORE the awaits below, or a slow save leaves them live while
     the pointer is already somewhere else. */
  if (enBody.indexOf('window.removeEventListener(') > enBody.indexOf('await '))
    throw new Error('the listeners come off only after the save');

  /* THE ARROWS ARE STILL THERE - the keyboard path, and the one that works
     without a precise pointer. */
  if (!/up\.onclick=\(\)=>moveLayer\(name,1\);/.test(code)
    || !/dn\.onclick=\(\)=>moveLayer\(name,-1\);/.test(code))
    throw new Error('the arrows were removed');

  /* THE OFF SWITCH IS THE EXISTING SET, not a second one. */
  if (!/eye\.onclick=async\(\)=>\{/.test(code))
    throw new Error('the row cannot turn a set off');
  if (!/const HIDDEN_LAYERS=new Set\(\);/.test(code))
    throw new Error('HIDDEN_LAYERS is not where this expects it');
  /* And the shelf heading one still exists, or this moved the control
     rather than adding one. */
  if (!/sb\.textContent = off \? "turn on" : "turn off";/.test(code))
    throw new Error('the shelf heading switch was removed');

  /* THE PAINT NO LONGER WAITS ON THE SERVER. */
  const sl = kit.inFunction(codeLines, 'async function saveLayers(){');
  const slBody = codeLines.slice(sl.start, sl.end + 1).join('\n');
  if ((slBody.match(/await renderShelf\(\);/g) || []).length !== 1)
    throw new Error('saveLayers should render exactly once');
  if (slBody.indexOf('await renderShelf();') > slBody.indexOf('await fetch('))
    throw new Error('the list still repaints only after the round trip');

  /* TOUCH. Without this the gesture is a scroll and the handle does nothing
     on a phone - the same trap the fix button walked into. */
  if (!/\.lgrip\{[^}]*touch-action:none/.test(text))
    throw new Error('the handle would scroll the page instead of dragging');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
