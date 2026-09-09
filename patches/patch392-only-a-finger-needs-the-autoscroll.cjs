/* THE DRAG AUTOSCROLL BROKE A MOUSE DRAG, AND THE SUITE CAUGHT IT.

   patch387 gave the shelf drag an edge autoscroll, because on a phone the drag
   captures the pointer and a trait could only be dropped among the six tiles
   already on screen. It ran for every pointer.

   shelf.spec.js "drags within and between layers without opening the editor"
   went red: it drags alpha onto gamma with page.mouse, the destination sits
   inside 72px of the bottom of a 900px window, so the page scrolled under the
   drag and alpha landed back in backgrounds instead of skins. Expected
   "t_alpha_skins_wip|skins", got "t_alpha_backgrounds_wip|backgrounds".

   THE REASON THIS EXISTS ONLY APPLIES TO A FINGER. A mouse has a wheel and a
   trackpad has two fingers; neither needs the page dragged out from under it,
   and for a mouse resting near an edge the scroll is a surprise rather than a
   help. Touch and pen have no second way to scroll while a pointer is
   captured, which is the whole argument patch387 made.

   So the loop asks what started the drag. Anything that is not a mouse gets
   the autoscroll; a mouse gets what it always had. That also restores the
   test, which is the point: it was describing a real thing a mouse user would
   have hit.

   Recorded at startShelfDrag, which is the only place the pointer type is
   known - updateShelfDragTarget is handed two numbers and nothing else. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

{
  const at = kit.only(L, l => l === '  shelfDrag={key,card,handle,ghost,target:null};', 'the drag state');
  kit.replace(L, { start: at, end: at }, [
    '  /* WHAT STARTED IT, because the autoscroll below is only for pointers that',
    '     have no other way to scroll. A mouse has a wheel; dragging the page out',
    '     from under one resting near an edge is a surprise, and it moved a real',
    '     drop in shelf.spec.js from skins back to backgrounds. */',
    '  shelfDrag={key,card,handle,ghost,target:null,',
    '    autoscroll:(event.pointerType&&event.pointerType!=="mouse")};',
  ]);
}
{
  const r = kit.inFunction(L, 'function shelfDragScroll(){');
  const at = kit.only(L, l => l === '  if(!shelfDrag||typeof shelfDrag.y!=="number") return;',
    'the loop guard', r);
  kit.replace(L, { start: at, end: at }, [
    '  if(!shelfDrag||typeof shelfDrag.y!=="number") return;',
    '  /* A mouse keeps its wheel and its old behaviour. Touch and pen have',
    '     neither while the pointer is captured, which is why this exists. */',
    '  if(!shelfDrag.autoscroll) return;',
  ]);
}

const bytes = kit.save(doc, ({ codeLines }) => {
  const start = kit.inFunction(codeLines, 'function startShelfDrag(event,record,card,handle){');
  const sBody = codeLines.slice(start.start, start.end + 1).join('\n');
  if (!/autoscroll:\(event\.pointerType&&event\.pointerType!=="mouse"\)/.test(sBody))
    throw new Error('the drag does not record what started it');

  const loop = kit.inFunction(codeLines, 'function shelfDragScroll(){');
  const lBody = codeLines.slice(loop.start, loop.end + 1).join('\n');
  if (!/if\(!shelfDrag\.autoscroll\) return;/.test(lBody))
    throw new Error('the loop still scrolls for every pointer');
  /* And it still scrolls for the pointer it was written for. */
  if (!/window\.scrollBy\(0,dy\)/.test(lBody))
    throw new Error('the loop no longer scrolls at all');
  /* The guard must come BEFORE the work, or a mouse pays for it anyway. */
  if (lBody.indexOf('if(!shelfDrag.autoscroll) return;') > lBody.indexOf('window.scrollBy'))
    throw new Error('the pointer check runs after the scroll it is meant to prevent');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
