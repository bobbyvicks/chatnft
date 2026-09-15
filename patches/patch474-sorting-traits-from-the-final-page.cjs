/* SORTING TRAITS INTO LAYERS FROM THE FINAL PROJECT PAGE.

   "in the Final project tab we have a bunch of unsorted things but I want to be
   able to sort them. Let that be a thing for all the traits but even more
   important for the unsorted (thats not an actual layer)."

   A batch import lands everything in "unsorted", and the Final page is where
   you look at what is going into the collection - so it is exactly where you
   notice that six of your final traits are not filed anywhere. Until now the
   only way out was back to the shelf and its eight controls per tile, which is
   the thing this page exists to escape.

   ONE SELECT PER TILE, on every tile - the chosen ones and the ones waiting in
   a fold - because "let that be a thing for all the traits" is what was asked
   for, and because a trait in the wrong layer is in the wrong layer whether or
   not it made the cut.

   ("unsorted (thats not an actual layer)" is how it feels and not how the code
   has it: unsorted is the last ordinary member of DEFAULT_LAYERS, painted,
   generated from, weighted and exported like any other. It is special in five
   narrow places only - always present, cannot be removed, left out of the rules
   review picker, exempt from the grid rule, and exempt from this page's bare
   layer warning. So filing a trait out of it is an ordinary layer move and gets
   no special case here.)

   THROUGH commitShelfMove, WHICH ALREADY EXISTS. That is the single-trait move
   the drag handle and the keyboard already use - keyboardShelfMove calls it as
   commitShelfMove({recordKey,toLayer:LAYERS[to],beforeKey:null}), character for
   character the call this makes. It carries the four things a layer change has
   to carry across the rewritten record id:

     the hidden set      state.transfer(oldKey,newKey)
     the shelf selection pickTransfer(oldKey,newKey)
     the unsaved draft   draftsFollow([{from:oldId,to:newId}])
     the rules           retargetRules([{from:traitKey,to:traitKey}])

   and it renormalises shelfOrder across both layers, refuses a name already in
   the destination, refuses an unsynced trait while a group is attached, holds
   the shelfMoveBusy lock the drag path also takes, and ROLLS BACK if the group
   refuses the move.

   THE RULES ARE THE ONE THAT WOULD BE MISSED. A copy of setTraitStatus - the
   obvious thing to crib, since it is what this page's other control uses -
   would carry the record, the draft, the hidden key, the pick key and the cloud
   row, and would pass a draft-survival test. It does not call retargetRules,
   and it is right not to: a rule is keyed layer/name, and a status change moves
   neither. A LAYER change moves one of them. So the copy would ship, and
   conflictsWith would quietly start returning false for a pair somebody
   forbade. That is the loss rulesfollow.spec.js calls the one that cannot come
   back, which is why the rule test here is the first discriminator and the
   draft test is the second.

   NOT bulkMoveToLayer, WHICH WAS THE FIRST PLAN. It reads the global shelfPick
   rather than taking an argument, clears it, has no rollback, and checks the
   unsynced guard only against the PICKED traits rather than every record the
   plan touches - so an unsynced NEIGHBOUR in the destination layer reaches
   rpcItems, throws, and leaves this device and the group disagreeing forever
   with nothing but a clause on a toast. Splitting it would have been a refactor
   to reach a function that already existed, one layer down, in better shape.

   WHAT THIS COSTS, MEASURED, because the argument against a per-tile control is
   that filing forty traits one at a time is forty writes, forty renders and
   forty round trips - and bulkMoveToLayer's own header makes exactly that
   argument for the shelf. On a seeded 324-trait project one whole move from
   this page - commitShelfMove, its renderShelf, and renderFinal - took 41ms; at
   544 traits it took 90ms. renderShelf is cheap here because #proj is
   display:none on this page, and opening a 260-tile fold took 1ms because
   shelfTile registers a canvas with the IntersectionObserver rather than
   decoding a picture. The figure the argument rests on, 232ms for 318 tiles,
   is the shelf page with its thumbnails on screen. A per-gesture 90ms is not a
   reason to make somebody pick, choose and press to move one trait.

   THE VALUE HAS TO SETTLE FIRST. A closed select in Chromium fires change on
   EVERY arrow key - measured, four presses fired four change events, one per
   step. Acting on each ends the gesture at the FIRST of them: the control shuts
   itself for the length of the move it has just started, so the rest of the
   keypresses never reach it. Measured on exactly that build, arrowing three
   layers up from unsorted moved the trait one layer up, to eyes, and the app
   said "Moved loose to eyes" - the wrong answer, stated plainly, with nothing
   on screen to contradict it. A move rewrites the record id, so this is not a
   wasted write that corrects itself.

   So the commit waits for the value to stop changing, and leaving the control
   commits at once because no more steps are coming.

   THE FOLDS STAY OPEN. renderFinal empties the host and builds every <details>
   fresh, so before this every move snapped shut the "add from unsorted (12)"
   fold the traits were being filed out of - and filing them is what the fold is
   for. Which layers were open is carried across the rebuild.

   THE PAGE REDRAWS ON EVERY PATH, not only on success. A select is a claim
   about the record: refuse the move and it sits there naming a layer the trait
   is not in, under a heading that says otherwise, until something else happens
   to redraw. A button cannot lie that way, which is why this page has not
   needed the rule until now.

   AND IT REDRAWS AFTER THE SHELF DOES. commitShelfMove ends with renderShelf,
   and renderShelf calls shelfWatchReset, which disconnects the
   IntersectionObserver every tile canvas on this page is registered on.
   Rendering this page afterwards puts its tiles on the fresh observer. finalMove
   has the other order and its tiles do paint - measured, renderShelf's own
   awaits leave a frame for the observer to fire in first - so that is a timing
   accident rather than a rule, and the new path does not lean on it.

   TWO MESSAGES THAT WERE NOT BEING SAID.

   commitShelfMove has always finished a cross-layer move with "Order saved",
   which describes the renumbering it also did rather than the filing anybody
   asked for - while announceShelf one line above already had the right
   sentence and gave it only to a screen reader. Both audiences get it now, and
   a move WITHIN a layer still says "Order saved", because there that is the
   whole of what happened.

   And #toast carried no live region at all, so none of this was ever announced;
   announceShelf's own region is inside #proj, which is display:none on this
   page, so the sentence written for screen readers could not be heard from
   here either. One attribute on the toast fixes it for every message in the
   app, not only for this one. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- 1. the control has a size ----------------------------------------- */
{
  const at = kit.only(L, l => l === '#finalset .item{cursor:default;}',
    'the final page tile rule');
  kit.replace(L, { start: at, end: at }, [
    '#finalset .item{cursor:default;}',
    '/* THE LAYER PICKER. Full tile width, because a layer name truncated to',
    '   three letters is not a label. Its own min-height because the only rule',
    '   that gives a select one lives inside the phone media query, and the file',
    '   already records what that omission costs: six selects "took the browser',
    '   default: measured 21px at 375x812, against 30 or more for every other',
    '   select on that viewport." This is that list again, so it is written down',
    '   here rather than left to be remembered. */',
    '#finalset .item select.fslayer{display:block; width:100%; margin-top:5px;',
    '  min-height:30px; padding:4px 5px; border-radius:6px; background:var(--ground);',
    '  border:1px solid var(--line); color:var(--muted); font:inherit;',
    '  font-size:10.5px; cursor:pointer;}',
    '#finalset .item select.fslayer:hover{border-color:var(--accent); color:var(--ink);}',
    '#finalset .item select.fslayer:disabled{opacity:.5; cursor:default;}',
  ]);
}

/* ---- 2. the toast can be heard ----------------------------------------- */
{
  /* Nothing in the app was announced. announceShelf's region is inside #proj,
     which the page rules hide on every page but the project - so the sentence
     written for screen readers is unreachable from here, and the toast that
     everyone else reads was never a live region to begin with. */
  const at = kit.only(L, l => l === '<div class="toast" id="toast"></div>',
    'the toast');
  kit.replace(L, { start: at, end: at }, [
    '<!-- role=status so what the app says is also announced. Every message in',
    '     the app goes through toast(); none of them reached a screen reader,',
    '     and the region announceShelf writes to lives inside #proj, which is',
    '     display:none on five of the six pages. -->',
    '<div class="toast" id="toast" role="status" aria-live="polite"></div>',
  ]);
}

/* ---- 3. a refused move says so ----------------------------------------- */
{
  /* SILENT BEFORE. Every other refusal in this function speaks; this one
     returned false and said nothing, which was invisible while only a drag
     could reach it - the drag never starts while the flag is held. A control
     on another page can reach it, and a control that answers a gesture with
     nothing is indistinguishable from a broken one. */
  const at = kit.only(L, l => l === '  if(shelfMoveBusy) return false;',
    'the busy guard');
  kit.replace(L, { start: at, end: at }, [
    '  /* SAID, NOT SILENT. This returned false without a word, which was fine',
    '     while a drag was the only way in - pointerdown checks the same flag and',
    '     never starts one. A control on the final project page can reach it, and',
    '     a gesture answered with nothing reads as a broken control. */',
    '  if(shelfMoveBusy){ toast("Still moving the last one"); return false; }',
  ]);
}

/* ---- 4. the message names the filing ----------------------------------- */
{
  const at = kit.only(L, l => l === '  const plan=shelfCore.planShelfMove(items,spec);',
    'the plan');
  kit.replace(L, { start: at, end: at }, [
    '  /* Read BEFORE the plan, which hands back records already carrying the',
    '     destination layer - so afterwards there is nothing left to compare. */',
    '  const moving=items.find(i=>shelfCore.recordKey(i)===String(spec&&spec.recordKey||""));',
    '  const originalLayer=moving?moving.layer:null;',
    '  const plan=shelfCore.planShelfMove(items,spec);',
  ]);
}
{
  const at = kit.only(L, l => l === "  toast(activeWs?'Order saved for the group':'Order saved');",
    'the move message');
  kit.replace(L, { start: at, end: at }, [
    '  /* WHICH THING HAPPENED. A drag within a layer is a reorder and "Order',
    '     saved" is the whole of it. A move to another layer is a filing, and',
    '     saying "Order saved" for it described the renumbering this also does',
    '     rather than the thing that was asked for - while announceShelf one line',
    '     up already had the right sentence and gave it only to a screen reader.',
    '     Same sentence, both audiences. */',
    '  const crossed=plan.destinationLayer!==originalLayer;',
    '  toast(crossed',
    "    ? 'Moved '+(plan.movedName||'the trait')+' to '+plan.destinationLayer",
    "      +(activeWs?' for the group':'')",
    "    : (activeWs?'Order saved for the group':'Order saved'));",
  ]);
}

/* ---- 5. the planner names what moved ----------------------------------- */
{
  const at = kit.only(L, l => l === '      destinationLayer: toLayer,',
    'what the plan reports');
  kit.replace(L, { start: at, end: at }, [
    '      destinationLayer: toLayer,',
    '      /* So a caller can name the trait without reading the record back: the',
    '         planner is the only thing that knows which of the updates is the one',
    '         that actually moved, the rest being renumbered neighbours. */',
    '      movedName: String(source.name || ""),',
  ]);
}

/* ---- 6. the move, and the control that starts it ------------------------ */
{
  const at = kit.only(L, l => l === 'function finalTile(t,label,note,press){',
    'the final tile');
  kit.replace(L, { start: at, end: at }, [
    '/* How long the layer picker waits for a choice to stop changing. A closed',
    '   select fires change on every arrow key, so this is what separates one',
    '   choice from the four steps taken to reach it. Long enough to cover held',
    '   and repeated presses, short enough that a mouse pick does not feel like',
    '   it was ignored. */',
    'const FSORT_SETTLE=350;',
    '/* MOVE ONE TRAIT TO ANOTHER LAYER, from this page.',
    '',
    '   Straight to commitShelfMove, which is the single-trait move the drag',
    '   handle and the keyboard already use. It carries the hidden key, the shelf',
    '   selection, the unsaved draft and the rules across the rewritten record id,',
    '   refuses a name already in the destination, refuses an unsynced trait while',
    '   a group is attached, and rolls the whole thing back if the group refuses.',
    '',
    '   beforeKey null: appended to the end of the destination, which is what a',
    '   filing means. There is no position to choose on this page - the order',
    '   within a layer is business for the shelf.',
    '',
    '   THE SAME-LAYER GUARD. planShelfMove does not refuse a move to the layer',
    '   the trait is already in: with no anchor it appends, so the trait lands at',
    '   the bottom of its own layer and every record in that layer is renumbered',
    '   and sent to the group. A change event cannot carry the value it already',
    '   had, so nobody reaches that by hand - a render landing under a',
    '   half-finished gesture can, and this costs one comparison. */',
    'async function finalSort(t,layer){',
    '  const now=t.layer||"unsorted";',
    '  if(!layer||layer===now) return false;',
    '  const ok=await commitShelfMove({recordKey:shelfCore.recordKey(t),',
    '    toLayer:layer, beforeKey:null});',
    '  /* ON EVERY PATH, not only the one that worked. A select is a claim about',
    '     the record: a refused move leaves it naming a layer the trait is not in,',
    '     under a heading that says otherwise, and only a redraw takes that back.',
    '',
    '     After commitShelfMove rather than before, because it ends with',
    '     renderShelf and renderShelf resets the IntersectionObserver every tile',
    '     canvas here is registered on. Drawn again afterwards, the tiles on',
    '     tiles go on the new one. */',
    '  await renderFinal();',
    '  return ok;',
    '}',
    'function finalTile(t,label,note,press){',
  ]);
}
{
  const at = kit.only(L, l => l === '  el.appendChild(b);',
    'the tile button being added', kit.inFunction(L, 'function finalTile(t,label,note,press){'));
  kit.replace(L, { start: at, end: at }, [
    '  el.appendChild(b);',
    '  /* WHICH LAYER IT IS IN, AND THE WAY OUT OF THE WRONG ONE. On every tile,',
    '     not only the unsorted ones: a trait filed under the wrong layer is wrong',
    '     wherever it is sitting.',
    '',
    '     A select rather than buttons. A project has a dozen layers and a dozen',
    '     buttons is not a tile, and the shelf already offers its bulk destination',
    '     as a select - so this is the control the app already has rather than a',
    '     second idea of what choosing a layer looks like. Named after its trait,',
    '     because a page of these would otherwise read as 324 identical boxes. */',
    '  const sel=document.createElement("select");',
    '  sel.className="fslayer";',
    '  sel.setAttribute("aria-label","Layer for "+t.name);',
    '  sel.title="Which layer "+t.name+" belongs to";',
    '  const here=t.layer||"unsorted";',
    '  /* From LAYERS, not from the sections on screen: renderFinal draws a section',
    '     only for a layer that already holds a trait, so an empty layer would be',
    '     unreachable exactly when it is the one you need. Plus the layer the trait',
    '     layer if the list has never heard of it, so the control can always say',
    '     where the trait actually is. */',
    '  const names=LAYERS.slice();',
    '  if(names.indexOf(here)<0) names.push(here);',
    '  for(const name of names){',
    '    const o=document.createElement("option");',
    '    o.value=name; o.textContent=name;',
    '    sel.appendChild(o);',
    '  }',
    '  sel.value=here;',
    '  /* ON THE CHOICE, NOT ON EVERY STEP TOWARDS IT. A closed select in Chromium',
    '     fires change on every arrow key - measured, four presses fired four change',
    '     events, one per step. Acting on each ends the gesture at the FIRST of',
    '     them, because the line below shuts the control for the length of the move',
    '     it has just started and the rest of the keypresses never arrive. Measured',
    '     on that build: arrowing three layers up from unsorted moved the trait one',
    '     layer up, to eyes, and the app said "Moved loose to eyes" - the wrong',
    '     answer, stated plainly, with nothing on screen to contradict it.',
    '',
    '     So the value is allowed to settle and whatever it lands on is what moves.',
    '     Leaving the control commits at once, because no more steps are coming. */',
    '  let settle=null;',
    '  const commit=async()=>{',
    '    if(settle){ clearTimeout(settle); settle=null; }',
    '    const want=sel.value;',
    '    /* Held shut for the length of the move: commitShelfMove refuses a second',
    '       one while the first runs, and a control that answers a gesture with the',
    '       refusal earned by the previous gesture is worse than no answer at all. */',
    '    sel.disabled=true;',
    '    try{ await finalSort(t,want); }',
    '    finally{ sel.disabled=false; }',
    '  };',
    '  sel.onchange=()=>{',
    '    if(settle) clearTimeout(settle);',
    '    settle=setTimeout(()=>{ settle=null; commit(); },FSORT_SETTLE);',
    '  };',
    '  /* Only while one is still waiting. commit() clears the timer on the way in,',
    '     so a blur after it has already fired does nothing. */',
    '  sel.onblur=()=>{ if(settle) commit(); };',
    '  el.appendChild(sel);',
  ]);
}

/* ---- 7. the folds survive the rebuild ---------------------------------- */
{
  const at = kit.only(L, l => l === '  host.innerHTML="";', 'the page being emptied');
  kit.replace(L, { start: at, end: at }, [
    '  /* WHICH FOLDS WERE OPEN. This rebuilds the whole page, so without carrying',
    '     this across, every move snapped shut the "add from unsorted (12)" fold',
    '     the trait was being filed out of - and filing them one after another is',
    '     what that fold is for. Read before the host is emptied, applied after',
    '     each one is rebuilt. */',
    '  const wasOpen=new Set();',
    '  for(const d of host.querySelectorAll("details.fsadd"))',
    '    if(d.open&&d.dataset.layer) wasOpen.add(d.dataset.layer);',
    '  host.innerHTML="";',
  ]);
}
{
  const at = kit.only(L, l => l === '      sec.appendChild(d);',
    'the fold being added', kit.inFunction(L, 'async function renderFinal(){'));
  kit.replace(L, { start: at, end: at }, [
    '      /* Named, so the next render can find it again. */',
    '      d.dataset.layer=layer;',
    '      /* Filled here rather than left to the toggle event the browser sends,',
    '         which arrives a task later - long enough for the page to be read as',
    '         an empty fold. Calling it directly is what the ontoggle guard above',
    '         already tolerates: the real event fires afterwards, finds the grid',
    '         no longer empty, and returns. */',
    '      if(wasOpen.has(layer)){ d.open=true; d.ontoggle(); }',
    '      sec.appendChild(d);',
  ]);
}

const bytes = kit.save(doc, ({ text, codeLines }) => {
  const code = codeLines.join('\n');

  /* THE PAGE GOES THROUGH THE ONE MOVE. This is the whole patch: a second copy
     of what a layer change carries would agree today and drift tomorrow, and it
     would be invisible to the 25 tests that pin drafts, rules, picks and hidden
     keys following a move. */
  const fsFn = kit.inFunction(codeLines, 'async function finalSort(t,layer){');
  const body = codeLines.slice(fsFn.start, fsFn.end + 1).join('\n');
  if (!/const ok=await commitShelfMove\(\{recordKey:shelfCore\.recordKey\(t\),/.test(body))
    throw new Error('the page moves a trait between layers its own way');
  for (const leaked of ['dbPut(', 'dbDel(', 'dbApplyShelfRecords', 'draftsFollow',
    'retargetRules', 'pickTransfer', 'planShelfMove', 'cloudSaveShelfPlan',
    'setTraitStatus']) {
    if (body.indexOf(leaked) >= 0)
      throw new Error('the page has its own copy of ' + leaked + ', which will drift');
  }
  /* THE SAME-LAYER GUARD, which the planner does not have. */
  if (!/if\(!layer\|\|layer===now\) return false;/.test(body))
    throw new Error('moving a trait to the layer it is already in is not refused');
  /* AND THE REDRAW IS UNCONDITIONAL - no branch between the move and it, so a
     refusal cannot skip it and leave the select naming a layer the trait is
     not in. */
  if (/if\s*\(\s*ok\s*\)/.test(body))
    throw new Error('the redraw is behind a success test, so a refused move leaves the select lying');
  if (!/await renderFinal\(\);\s*\n\s*return ok;/.test(body))
    throw new Error('the page is not redrawn after the move, so the select lies');

  /* THE CONTROL IS A SELECT ON THE TILE. */
  const ft = kit.inFunction(codeLines, 'function finalTile(t,label,note,press){');
  const ftb = codeLines.slice(ft.start, ft.end + 1).join('\n');
  if (!/const sel=document\.createElement\("select"\);/.test(ftb))
    throw new Error('the tile carries no layer control');
  if (!/sel\.className="fslayer";/.test(ftb))
    throw new Error('the layer control is not the one the page styles and the tests drive');
  /* NAMED AFTER ITS TRAIT. A page of these is otherwise a row of identical
     combo boxes to anyone not looking at the picture above them. */
  if (!/sel\.setAttribute\("aria-label","Layer for "\+t\.name\);/.test(ftb))
    throw new Error('the controls are indistinguishable from one another when read aloud');
  /* FROM LAYERS. Reading the rendered sections would offer only the layers that
     already hold something, which excludes every layer worth moving to. */
  if (!/const names=LAYERS\.slice\(\);/.test(ftb))
    throw new Error('the options do not come from the project layers');
  if (!/if\(names\.indexOf\(here\)<0\) names\.push\(here\);/.test(ftb))
    throw new Error('a trait in a layer nobody declared would have no option for where it is');
  if (!/sel\.value=here;/.test(ftb))
    throw new Error('the control does not show which layer the trait is in');
  /* SHUT WHILE IT RUNS. */
  if (!/sel\.disabled=true;/.test(ftb) || !/finally\{ sel\.disabled=false; \}/.test(ftb))
    throw new Error('the control stays live during the move it started');

  /* THE VALUE SETTLES BEFORE ANYTHING MOVES. Without this a keyboard user
     arrowing four layers down starts four moves and lands in the first one. */
  if (!/settle=setTimeout\(\(\)=>\{ settle=null; commit\(\); \},FSORT_SETTLE\);/.test(ftb))
    throw new Error('every arrow key on the way to a choice starts its own move');
  if (!/if\(settle\) clearTimeout\(settle\);/.test(ftb))
    throw new Error('the waits stack up rather than replacing one another');
  if (!/sel\.onblur=\(\)=>\{ if\(settle\) commit\(\); \};/.test(ftb))
    throw new Error('leaving the control does not commit the choice it is showing');
  if (!/const FSORT_SETTLE=350;/.test(code))
    throw new Error('there is no settling time to wait');

  /* THE FOLDS SURVIVE A REBUILD, which is the gesture this feature is for:
     twelve loose traits filed one after another out of one open fold. */
  const rf = kit.inFunction(codeLines, 'async function renderFinal(){');
  const rfb = codeLines.slice(rf.start, rf.end + 1).join('\n');
  if (!/const wasOpen=new Set\(\);/.test(rfb))
    throw new Error('the page forgets which folds were open');
  if (!/if\(d\.open&&d\.dataset\.layer\) wasOpen\.add\(d\.dataset\.layer\);/.test(rfb))
    throw new Error('the open folds are not collected before the page is emptied');
  if (!/d\.dataset\.layer=layer;/.test(rfb))
    throw new Error('a fold does not say which layer it is, so it cannot be found again');
  if (!/if\(wasOpen\.has\(layer\)\)\{ d\.open=true; d\.ontoggle\(\); \}/.test(rfb))
    throw new Error('a fold that was open is rebuilt shut');
  /* READ BEFORE THE EMPTYING, or it collects nothing and passes silently. */
  if (rfb.indexOf('const wasOpen=new Set();') > rfb.indexOf('host.innerHTML="";'))
    throw new Error('the open folds are read after the page is emptied, so the set is always empty');
  /* AND THE LAZY FILL IS STILL LAZY - a fold nobody opened must still build
     nothing, or this page decodes the whole collection to show you twelve. */
  if (!/if\(!d\.open\|\|g\.childElementCount\) return;/.test(rfb))
    throw new Error('the add list is built on every render rather than when it is opened');

  /* THE MESSAGE NAMES THE FILING, checked inside commitShelfMove so a sentence
     that moved elsewhere is not mistaken for this one. */
  const cs = kit.inFunction(codeLines, 'async function commitShelfMove(spec){');
  const csb = codeLines.slice(cs.start, cs.end + 1).join('\n');
  if (!/const crossed=plan\.destinationLayer!==originalLayer;/.test(csb))
    throw new Error('the message cannot tell a filing from a reorder');
  if (!/const originalLayer=moving\?moving\.layer:null;/.test(csb))
    throw new Error('the layer it came from is not read before the plan rewrites it');
  /* AND A REORDER STILL SAYS WHAT IT ALWAYS SAID. A change that called every
     move a filing would be wrong about the commonest one. */
  if (!/\(activeWs\?'Order saved for the group':'Order saved'\)/.test(csb))
    throw new Error('a drag within one layer no longer says that the order was saved');
  /* THE BUSY REFUSAL SPEAKS. */
  if (!/if\(shelfMoveBusy\)\{ toast\("Still moving the last one"\); return false; \}/.test(csb))
    throw new Error('a move refused because another is running still says nothing');
  /* THE ROLLBACK IS UNTOUCHED - it is the reason this path was chosen over the
     bulk one, so a patch that quietly lost it would defeat its own argument. */
  if (!/await dbApplyShelfRecords\(plan\.updates\.map\(update=>update\.record\.id\),originals\);/.test(csb))
    throw new Error('a move the group refused no longer puts the records back');
  if (!/toast\(shared\.reason==='duplicate'/.test(csb))
    throw new Error('the cloud rollback message went with the message change');
  /* AND THE PLAN-WIDE UNSYNCED GUARD, the other reason. */
  if (!/if\(activeWs&&plan\.updates\.some\(update=>!update\.record\.rowId\)\)\{/.test(csb))
    throw new Error('the guard that checks every record the plan touches is gone');

  /* THE PLANNER SAYS WHICH TRAIT MOVED. */
  if (!/movedName: String\(source\.name \|\| ""\),/.test(code))
    throw new Error('the plan does not name the trait that moved');

  /* WHAT THE APP SAYS CAN BE HEARD. */
  if (text.indexOf('<div class="toast" id="toast" role="status" aria-live="polite"></div>') < 0)
    throw new Error('the toast is still not a live region, so nothing the app says is announced');

  /* THE TILE STRUCTURE THE EXISTING TESTS READ IS UNCHANGED: the chosen grid is
     still a direct child of .layer, the tile still carries its name on title,
     and the tile still holds exactly one button - three tests reach for the
     first button in a tile and one counts them all. */
  if (!/const g=document\.createElement\("div"\); g\.className="items";\s*\n\s*for\(const t of keep\)/.test(rfb))
    throw new Error('the chosen grid is no longer a direct child of the layer');
  if (!/el\.className="item"; el\.title=t\.name;/.test(ftb))
    throw new Error('the tile no longer names itself, which is how the page is read');
  if ((ftb.match(/createElement\("button"\)/g) || []).length !== 1)
    throw new Error('the tile holds more than one button, which three existing tests read past');

  /* AND THE CONTROL HAS A SIZE. The only rule giving a select a min-height is
     inside the phone media query, and the file already records that this list
     has come up short twice. */
  if (text.indexOf('#finalset .item select.fslayer{') < 0)
    throw new Error('the layer control has no style, so it has no reliable size');
  if (!/#finalset \.item select\.fslayer\{[^}]*min-height:30px;/.test(text))
    throw new Error('the control has no minimum height, which is the omission that shipped twice');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
