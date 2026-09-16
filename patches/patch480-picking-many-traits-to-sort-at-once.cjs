/* PICKING MANY TRAITS AND FILING THEM AT ONCE.

   "In Final project i need there to be a way for me to change what trait layer
   is in which, ATM its not working (i asked yesterday) we have a bunch of
   unnsorted traits that need to be sorted but i cant rn so give the option to
   select and click multiple to add to a trait layer"

   474 put a layer picker on every tile and it does work - measured, a personal
   project moves a trait and says "Moved a to skins". The reason it is not
   working is that the tiles are not there to pick from.

   MEASURED, arriving at the page with four unsorted traits that are not in the
   final set:

     tiles on screen   1       the one stfp skin
     layer pickers     1
     folds             add from unsorted (4), CLOSED

   Everything that needs sorting is a trait that has NOT been chosen, and those
   live inside a collapsed <details> whose label reads "add from unsorted" -
   which sounds like it is about the final set, not about filing. So the page
   offered a per-tile picker for the traits that were already filed and hid the
   ones that were not.

   SO: THE PILE IS ON SCREEN, AND IT CAN BE PICKED.

   The unsorted fold is open the first time the page is drawn in a session and
   follows what you do with it after that. Opening it is cheap - shelfTile
   registers a canvas with the IntersectionObserver rather than decoding a
   picture, measured at 1ms for 260 tiles - so this costs nothing and it is the
   difference between the pile being there and not.

   Every tile takes a tick. The bar underneath the count says how many are
   picked, offers a layer, and moves them. Pick all shown is there because the
   case this is for is a batch import, where the answer is "all of them".

   THROUGH bulkMoveToLayer, WHICH ALREADY EXISTS, and through the SAME shelfPick
   the shelf uses - so a trait picked here is picked there, there is one idea of
   "picked" rather than two, and the move is the one that plans every trait
   together and writes, renders and syncs once. Its own header makes that
   argument: doing forty traits one at a time is forty reads, forty renders and
   forty round trips.

   It also gets past the thing that blocks the per-tile picker in a group.
   commitShelfMove refuses when ANY record its plan touches is unsynced, and a
   plan touches every trait in both layers - so one unsent neighbour refuses
   every move. Measured: a group project with one unsynced trait in unsorted
   refused to move a different, fully synced one. bulkMoveToLayer checks only
   the traits you picked.

   AND THE REFUSAL NAMES THEM NOW. "Send the unsynced traits to the group before
   rearranging them" does not say which, or how, and there is no way to find out
   from the page you are on. It names them and says which button to press. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the bar and the tick have a shape ------------------------------- */
{
  const at = kit.only(L, l => l === '#finalset .fscount{font-variant-numeric:tabular-nums;}',
    'the final page count rule');
  kit.replace(L, { start: at, end: at }, [
    '#finalset .fscount{font-variant-numeric:tabular-nums;}',
    '/* THE PICK BAR, shaped like the shelf one it shares a selection with. */',
    '#finalset .fspick{display:flex; align-items:center; flex-wrap:wrap; gap:8px;',
    '  width:100%; margin:10px 0 2px; font-size:12px; color:var(--muted);}',
    '#finalset .fspick select{padding:5px 8px; border-radius:7px; background:var(--ground);',
    '  border:1px solid var(--line); color:var(--ink); font:inherit; font-size:12px;',
    '  min-height:30px;}',
    '/* THE TICK. In the corner the rarity box uses on a shelf tile, and inside a',
    '   label with padding so the thing you press is 28px rather than 18 - a',
    '   checkbox cannot be given a touch target any other way. */',
    '#finalset .item .fspicklab{position:absolute; left:2px; top:2px; padding:5px;',
    '  line-height:0; cursor:pointer; border-radius:6px; background:#0b0910cc;}',
    '#finalset .item .fspicklab input{width:18px; height:18px; margin:0; cursor:pointer;',
    '  accent-color:var(--accent);}',
  ]);
}

/* ---- 2. the bar ---------------------------------------------------------- */
{
  const at = kit.only(L, l => l === '    <div class="fswarn" id="finalwarn" hidden></div>',
    'the bare layer warning');
  kit.replace(L, { start: at, end: at }, [
    '    <!-- PICK SEVERAL, FILE THEM AT ONCE. The case this is for is a batch',
    '         import: a few hundred traits in unsorted, all going to the same',
    '         handful of layers. One at a time is the thing the shelf pick bar was',
    '         built to replace, and this is that bar on the page where the mess is',
    '         actually looked at. -->',
    '    <div class="fspick" id="fspick" hidden>',
    '      <span id="fspickcount">Nothing picked</span>',
    '      <button class="mini" type="button" id="fspickall"',
    '        title="Pick every trait on screen, including the ones in an open fold">Pick all shown</button>',
    '      <label for="fspicklayer" class="sr-only">Move the picked traits to</label>',
    '      <select id="fspicklayer" aria-label="Move the picked traits to"></select>',
    '      <button class="mini go" type="button" id="fspickmove" disabled',
    '        title="Move every picked trait to that layer, in one go">Move</button>',
    '      <button class="mini" type="button" id="fspicknone" disabled>Clear</button>',
    '    </div>',
    '    <div class="fswarn" id="finalwarn" hidden></div>',
  ]);
}

/* ---- 3. the tick on every tile ------------------------------------------ */
{
  const at = kit.only(L, l => l === '  el.className="item"; el.title=t.name;',
    'the tile', kit.inFunction(L, 'function finalTile(t,label,note,press){'));
  kit.replace(L, { start: at, end: at }, [
    '  el.className="item"; el.title=t.name;',
    '  /* PICKED BY RECORD KEY, which is what the move takes and what shelfPick',
    '     holds - so a trait picked here is the same trait picked on the shelf,',
    '     and there is one idea of "picked" rather than two. */',
    '  const key=shelfCore.recordKey(t);',
    '  el.dataset.key=key;',
    '  {',
    '    const lab=document.createElement("label");',
    '    lab.className="fspicklab";',
    '    lab.title="Pick "+t.name+" to file it with others";',
    '    const cb=document.createElement("input");',
    '    cb.type="checkbox"; cb.className="fspick";',
    '    cb.dataset.key=key;',
    '    cb.setAttribute("aria-label","Pick "+t.name);',
    '    cb.checked=shelfPick.has(key);',
    '    cb.onchange=()=>{',
    '      if(cb.checked) shelfPick.add(key); else shelfPick.delete(key);',
    '      finalPickPaint();',
    '    };',
    '    lab.appendChild(cb);',
    '    el.appendChild(lab);',
    '  }',
  ]);
}

/* ---- 4. what the bar says ------------------------------------------------ */
{
  const at = kit.only(L, l => l === 'function finalTile(t,label,note,press){', 'the final tile');
  kit.replace(L, { start: at, end: at }, [
    '/* WHAT IS PICKED, ON THE BAR AND ON THE TILES. One writer, so a tick and a',
    '   count cannot say different things. */',
    'function finalPickPaint(){',
    '  const n=shelfPick.size;',
    '  const c=$("fspickcount");',
    '  if(c) c.textContent = n ? n+" picked" : "Nothing picked";',
    '  for(const id of ["fspickmove","fspicknone"]){ const e=$(id); if(e) e.disabled=!n; }',
    '  for(const cb of document.querySelectorAll("#finallayers input.fspick"))',
    '    cb.checked=shelfPick.has(cb.dataset.key);',
    '  for(const el of document.querySelectorAll("#finallayers .item[data-key]"))',
    '    el.classList.toggle("picked",shelfPick.has(el.dataset.key));',
    '}',
    '/* Opened once, on the first visit of a session, and left alone after that.',
    '   The traits that need filing are by definition the ones NOT in the final',
    '   set, so they all live in a fold - and a fold that reopened on every render',
    '   would be a control fighting whoever closed it. */',
    'let fsFoldsSeeded=false;',
    'function finalTile(t,label,note,press){',
  ]);
}

/* ---- 5. drawn, filled and seeded ---------------------------------------- */
{
  const fn = kit.inFunction(L, 'async function renderFinal(){');
  const at = kit.only(L, l => l === '  const wasOpen=new Set();', 'the open folds', fn);
  kit.replace(L, { start: at, end: at }, [
    '  const wasOpen=new Set();',
    '  /* ON THE FIRST VISIT ONLY. Everything that needs sorting is a trait nobody',
    '     has chosen, so all of it is inside a fold - and the page opened with the',
    '     pile invisible behind a label reading "add from unsorted". Measured on',
    '     arrival with four of them: one tile on screen and one layer picker. */',
    '  if(!fsFoldsSeeded){ fsFoldsSeeded=true; wasOpen.add("unsorted"); }',
  ]);
}
{
  const fn = kit.inFunction(L, 'async function renderFinal(){');
  const at = kit.only(L, l => l === '  const warn=$("finalwarn");', 'the warning', fn);
  kit.replace(L, { start: at, end: at }, [
    '  /* THE BAR, after the tiles it counts. Shown whenever there is anything to',
    '     pick; the two buttons that act on a selection are disabled until there',
    '     is one, which finalPickPaint owns. */',
    '  {',
    '    const bar=$("fspick");',
    '    if(bar) bar.hidden=!traits.length;',
    '    const sel=$("fspicklayer");',
    '    if(sel){',
    '      const keep=sel.value;',
    '      sel.innerHTML="";',
    '      for(const name of LAYERS){',
    '        const o=document.createElement("option");',
    '        o.value=name; o.textContent=name;',
    '        sel.appendChild(o);',
    '      }',
    '      if(LAYERS.indexOf(keep)>=0) sel.value=keep;',
    '    }',
    '    /* A trait that has been moved or deleted since the pick is no longer a',
    '       live key, and a count that included it would offer to move nothing. */',
    '    {',
    '      const live=new Set(traits.map(shelfCore.recordKey));',
    '      for(const k of [...shelfPick]) if(!live.has(k)) shelfPick.delete(k);',
    '    }',
    '    finalPickPaint();',
    '  }',
    '  const warn=$("finalwarn");',
  ]);
}

/* ---- 6. wired up --------------------------------------------------------- */
{
  const at = kit.only(L, l => l === "if($('fpsheet')) $('fpsheet').onclick=async()=>{",
    'the sheet press');
  kit.replace(L, { start: at, end: at }, [
    '/* THE PICK BAR. The move is bulkMoveToLayer - the one that plans every trait',
    '   together and writes, renders and syncs once - so forty traits are one of',
    '   each rather than forty. It clears the pick and renders the shelf itself;',
    '   this page is drawn afterwards, which is also the order that leaves its',
    '   tiles on a live IntersectionObserver. */',
    "if($('fspickmove')) $('fspickmove').onclick=async()=>{",
    "  const to=$('fspicklayer').value;",
    '  if(!to){ toast("Pick a layer to move them to"); return; }',
    '  await bulkMoveToLayer(to);',
    '  await renderFinal();',
    '};',
    "if($('fspicknone')) $('fspicknone').onclick=()=>{ shelfPick.clear(); finalPickPaint(); };",
    '/* SHOWN, not saved: a fold nobody opened holds tiles nobody can see, and',
    '   picking those would be picking blind. */',
    "if($('fspickall')) $('fspickall').onclick=()=>{",
    '  for(const el of document.querySelectorAll("#finallayers .item[data-key]"))',
    '    shelfPick.add(el.dataset.key);',
    '  finalPickPaint();',
    '};',
    "if($('fpsheet')) $('fpsheet').onclick=async()=>{",
  ]);
}

/* ---- 7. and the refusal names them -------------------------------------- */
{
  const at = kit.only(L, l => l === "    toast('Send the unsynced traits to the group before rearranging them');",
    'the unsynced refusal');
  kit.replace(L, { start: at - 1, end: at }, [
    '    /* NAMED, AND WITH THE BUTTON TO PRESS. This said which rule had been hit',
    '       and nothing about which traits or what to do, and the plan touches every',
    '       record in both layers - so the one holding you up is usually not the one',
    '       you were moving, and there was no way to find out which from here. */',
    '    const waiting=[...new Set(plan.updates.filter(u=>!u.record.rowId)',
    '      .map(u=>u.record.name).filter(Boolean))];',
    '    const few=waiting.slice(0,4);',
    '    toast(waiting.length',
    "      ? 'Not sent to the group yet: '+few.join(', ')",
    "        +(waiting.length>few.length ? ' and '+(waiting.length-few.length)+' more' : '')",
    "        +'. Press Save to cloud, then move them.'",
    "      : 'Send the unsynced traits to the group before rearranging them');",
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');

  /* THE PILE IS ON SCREEN. This is the whole reason the per-tile picker read as
     broken: the traits that need filing are the ones nobody has chosen, and all
     of them were inside a closed fold. */
  const rf = kit.inFunction(codeLines, 'async function renderFinal(){');
  const rfb = codeLines.slice(rf.start, rf.end + 1).join('\n');
  if (!/if\(!fsFoldsSeeded\)\{ fsFoldsSeeded=true; wasOpen\.add\("unsorted"\); \}/.test(rfb))
    throw new Error('the unsorted pile is still hidden behind a closed fold on arrival');
  /* ONCE. A fold that reopened on every render would fight whoever closed it. */
  if (!/let fsFoldsSeeded=false;/.test(code))
    throw new Error('there is nothing to remember that the fold has been opened already');

  /* ONE IDEA OF PICKED, shared with the shelf, so the move takes what it finds. */
  const ft = kit.inFunction(codeLines, 'function finalTile(t,label,note,press){');
  const ftb = codeLines.slice(ft.start, ft.end + 1).join('\n');
  if (!/const key=shelfCore\.recordKey\(t\);/.test(ftb))
    throw new Error('the tile is picked by something other than the key the move takes');
  if (!/if\(cb\.checked\) shelfPick\.add\(key\); else shelfPick\.delete\(key\);/.test(ftb))
    throw new Error('the tick does not go into the selection the move reads');
  /* A CHECKBOX, not a button: three tests reach for the first button in a tile
     and one counts them all. */
  if (!/cb\.type="checkbox"; cb\.className="fspick";/.test(ftb))
    throw new Error('the pick control is not a checkbox, which costs four existing tests');
  if ((ftb.match(/createElement\("button"\)/g) || []).length !== 1)
    throw new Error('the tile holds more than one button, which three existing tests read past');

  /* THE MOVE IS THE BULK ONE. Forty traits one at a time is forty reads, forty
     renders and forty round trips - its own header says so. */
  if (!/await bulkMoveToLayer\(to\);/.test(code))
    throw new Error('the bar moves traits one at a time');
  if (!/await bulkMoveToLayer\(to\);\s*\n\s*await renderFinal\(\);/.test(code))
    throw new Error('the page is not redrawn after the move');
  /* AND THE PAGE IS DRAWN AFTER THE SHELF, which bulkMoveToLayer renders
     itself - the order that leaves these tiles on a live observer. */

  /* THE BAR SAYS WHAT IS PICKED, AND ONE THING WRITES IT. */
  const pp = kit.inFunction(codeLines, 'function finalPickPaint(){');
  const ppb = codeLines.slice(pp.start, pp.end + 1).join('\n');
  if (!/for\(const id of \["fspickmove","fspicknone"\]\)\{ const e=\$\(id\); if\(e\) e\.disabled=!n; \}/.test(ppb))
    throw new Error('Move and Clear are offered with nothing picked');
  if (!/cb\.checked=shelfPick\.has\(cb\.dataset\.key\);/.test(ppb))
    throw new Error('the ticks and the count can disagree');
  /* AND A DEAD KEY IS DROPPED, or the count offers to move something that is
     no longer there. */
  if (!/for\(const k of \[\.\.\.shelfPick\]\) if\(!live\.has\(k\)\) shelfPick\.delete\(k\);/.test(rfb))
    throw new Error('a trait that has moved away is still counted as picked');

  /* PICK ALL MEANS WHAT IS SHOWN. */
  if (!/for\(const el of document\.querySelectorAll\("#finallayers \.item\[data-key\]"\)\)\s*\n\s*shelfPick\.add\(el\.dataset\.key\);/.test(code))
    throw new Error('pick all reaches tiles that are not on screen');

  /* THE REFUSAL NAMES THE TRAITS AND THE BUTTON. */
  const cs = kit.inFunction(codeLines, 'async function commitShelfMove(spec){');
  const csb = codeLines.slice(cs.start, cs.end + 1).join('\n');
  if (!/const waiting=\[\.\.\.new Set\(plan\.updates\.filter\(u=>!u\.record\.rowId\)/.test(csb))
    throw new Error('the refusal still says only that a rule was hit');
  if (!/Press Save to cloud, then move them\./.test(csb))
    throw new Error('the refusal does not say what to press');
  /* AND IT STILL REFUSES. A message is not a licence to send a plan the server
     will throw on. */
  if (!/if\(activeWs&&plan\.updates\.some\(update=>!update\.record\.rowId\)\)\{/.test(csb))
    throw new Error('the guard went with the message');
  if (!/return false;/.test(csb.slice(csb.indexOf('Press Save to cloud'))))
    throw new Error('the refusal now falls through and moves anyway');

  /* THE CONTROLS EXIST. */
  for (const id of ['fspick', 'fspickcount', 'fspickall', 'fspicklayer', 'fspickmove', 'fspicknone'])
    if (text.indexOf('id="' + id + '"') < 0)
      throw new Error('the bar is missing its ' + id);
  if (text.indexOf('#finalset .item .fspicklab{') < 0)
    throw new Error('the tick has no style, so it has no touch target');
  /* AND THE LAYER LIST IS STILL A DIRECT CHILD of the section, which is what
     three existing tests read through. */
  if (text.indexOf('    <div id="finallayers"></div>') < 0)
    throw new Error('the layer list moved, and three tests read it where it was');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
