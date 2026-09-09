/* A TRAIT CAN ONLY BE DROPPED AMONG THE TILES ALREADY ON SCREEN.

   The shelf holds 318 traits. Six fit on a phone. Press the drag handle, and
   the shelf will not move: the drag captures the pointer, so nothing scrolls,
   and the only places to let go are the handful of tiles inside the current
   812 pixels - or another layer, through the destination bar at the bottom.

   So reordering a trait from the middle of its layer to the front, which is
   the whole job the drag handle exists for, cannot be done on a phone at all.
   Letting go to scroll does not help: endShelfDrag(false) commits the move to
   wherever the finger was.

   AN EDGE AUTOSCROLL, which is what every list that can be dragged does. While
   a drag is live and the finger is within 72 pixels of the top or bottom of the
   window, the page scrolls, faster the closer to the edge, and the hit test is
   re-run at the finger's unchanged position so the drop marker follows the
   content rather than staying on whatever was under it before the page moved.

   It runs on requestAnimationFrame and stops itself the moment the drag ends or
   the finger leaves the edge, so a drag held in the middle of the screen costs
   one comparison a frame and nothing else.

   THE WINDOW SCROLLS, NOT A CONTAINER. Measured on the project page: at a drag
   the scrolling element is the document, window.scrollY moves and the shelf's
   own ancestors have no scroller of their own. If that ever changes this stops
   working rather than working wrongly, because scrollBy on a document that does
   not scroll is a no-op. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

/* ---- the loop, above the function that starts it ---------------- */
{
  const at = kit.only(L, l => l === 'function updateShelfDragTarget(clientX,clientY){',
    'the drag target updater');
  kit.replace(L, { start: at, end: at }, [
    '/* SCROLLING WHILE DRAGGING, which a phone cannot do any other way.',
    '',
    '   The drag captures the pointer, so the shelf does not move under it - and',
    '   six of 318 tiles fit on a phone screen. Reordering a trait to anywhere',
    '   outside that six was impossible: letting go to scroll commits the move.',
    '',
    '   Within 72px of an edge the page scrolls, faster the nearer the edge, and',
    '   the hit test is re-run at the SAME finger position so the marker follows',
    '   the content that moved under it. Stops itself when the drag ends or the',
    '   finger comes away from the edge. */',
    'let shelfScrollRaf=0;',
    'const SHELF_DRAG_EDGE=72, SHELF_DRAG_STEP=16;',
    'function shelfDragScrollStop(){',
    '  if(shelfScrollRaf){ cancelAnimationFrame(shelfScrollRaf); shelfScrollRaf=0; }',
    '}',
    'function shelfDragScroll(){',
    '  shelfScrollRaf=0;',
    '  if(!shelfDrag||typeof shelfDrag.y!=="number") return;',
    '  const h=window.innerHeight;',
    '  let dy=0;',
    '  if(shelfDrag.y<SHELF_DRAG_EDGE)',
    '    dy=-SHELF_DRAG_STEP*(1-shelfDrag.y/SHELF_DRAG_EDGE);',
    '  else if(shelfDrag.y>h-SHELF_DRAG_EDGE)',
    '    dy=SHELF_DRAG_STEP*(1-(h-shelfDrag.y)/SHELF_DRAG_EDGE);',
    '  if(dy){',
    '    const was=window.scrollY;',
    '    window.scrollBy(0,dy);',
    '    /* Only when the page actually moved: at the top or the bottom of the',
    '       shelf there is nowhere to go and re-running the hit test would be',
    '       work for nothing, every frame, for as long as the finger is held. */',
    '    if(window.scrollY!==was) updateShelfDragTarget(shelfDrag.x,shelfDrag.y);',
    '  }',
    '  shelfScrollRaf=requestAnimationFrame(shelfDragScroll);',
    '}',
    'function updateShelfDragTarget(clientX,clientY){',
  ]);
}

/* ---- remember where the finger is, and run the loop ------------- */
{
  const r = kit.inFunction(L, 'function updateShelfDragTarget(clientX,clientY){');
  const at = kit.only(L, l => l === '  if(!shelfDrag) return;', 'the drag guard', r);
  if (L[at + 1] !== '  clearShelfDragTarget();')
    throw new Error('the target is not cleared where this expects');
  kit.replace(L, { start: at, end: at }, [
    '  if(!shelfDrag) return;',
    '  /* Kept so the loop above can re-ask at the same place after it scrolls. */',
    '  shelfDrag.x=clientX; shelfDrag.y=clientY;',
    '  if(!shelfScrollRaf) shelfScrollRaf=requestAnimationFrame(shelfDragScroll);',
  ]);
}

/* ---- and stop it when the drag is over -------------------------- */
{
  const r = kit.inFunction(L, 'function endShelfDrag(cancelled){');
  const at = kit.only(L, l => l === '  if(!shelfDrag) return;', 'the end guard', r);
  kit.replace(L, { start: at, end: at }, [
    '  shelfDragScrollStop();',
    '  if(!shelfDrag) return;',
  ]);
}

/* ---- what has to be true of the result --------------------------- */
const bytes = kit.save(doc, ({ codeLines }) => {
  const fn = kit.inFunction(codeLines, 'function shelfDragScroll(){');
  const body = codeLines.slice(fn.start, fn.end + 1).join('\n');
  if (!/window\.scrollBy\(0,dy\)/.test(body)) throw new Error('the loop never scrolls');
  if (!/updateShelfDragTarget\(shelfDrag\.x,shelfDrag\.y\)/.test(body))
    throw new Error('the drop marker does not follow the content that moved');
  if (!/requestAnimationFrame\(shelfDragScroll\)/.test(body))
    throw new Error('the loop does not continue');
  /* IT MUST BE ABLE TO DO NOTHING. Without the edge test this would drag the
     page around under a finger held still in the middle of the screen. */
  if (!/shelfDrag\.y<SHELF_DRAG_EDGE/.test(body) || !/shelfDrag\.y>h-SHELF_DRAG_EDGE/.test(body))
    throw new Error('the loop scrolls wherever the finger is, not only at an edge');
  /* AND IT MUST STOP. A loop that outlives its drag runs for the life of the
     page. */
  if (!/if\(!shelfDrag\|\|typeof shelfDrag\.y!=="number"\) return;/.test(body))
    throw new Error('the loop does not stop when the drag ends');

  const end = kit.inFunction(codeLines, 'function endShelfDrag(cancelled){');
  const endBody = codeLines.slice(end.start, end.end + 1).join('\n');
  if (!/shelfDragScrollStop\(\)/.test(endBody))
    throw new Error('ending a drag leaves the scroll loop running');
  /* Before the early return, or a second end with no drag leaves it running. */
  if (endBody.indexOf('shelfDragScrollStop()') > endBody.indexOf('if(!shelfDrag) return;'))
    throw new Error('the loop is stopped after the early return, so it can outlive a cancelled drag');

  const up = kit.inFunction(codeLines, 'function updateShelfDragTarget(clientX,clientY){');
  const upBody = codeLines.slice(up.start, up.end + 1).join('\n');
  if (!/shelfDrag\.x=clientX; shelfDrag\.y=clientY;/.test(upBody))
    throw new Error('the finger position is not kept, so the loop cannot re-ask');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
