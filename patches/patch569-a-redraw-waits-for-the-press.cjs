/* A REDRAW WAITS FOR A PRESS ON THE SHELF TO END.

   Left open by 551: a full render rebuilds every tile, and a render that
   lands between a finger going down on a tile and coming up replaces the
   tile under it. The browser fires a click only where the press started
   and ended on the same element, and the one it started on is gone, so the
   tap does nothing. A pull, a teammate's change or the share estimate
   finishing can each start a render at any moment. A drag is the same
   press held longer, and a rebuild during one took the handle holding the
   pointer.

   The shelf now notes a press that starts inside it and holds the tile
   rebuild until the press ends - resumed a task later, so the click that
   ends the tap is dispatched first, on the tile it was meant for. Ten
   seconds at most, so a release the page never hears cannot hold the
   shelf. A render with no press in progress is unchanged: the wait is
   conditional, so it adds no await and a view-only render still builds in
   the task that asked for it. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label) => kit.only(L, l => l === line, label);
const swap = (line, to, label) => { const i = at(line, label); kit.replace(L, { start: i, end: i }, to); };

swap('let shelfReadSeq=-1;', [
  'let shelfReadSeq=-1;',
  '/* PRESSES ON THE SHELF, by pointer, and who is waiting for them to end.',
  '   A rebuild between a tile\'s press and its release lost the tap: the',
  '   click belongs to the element the press started on, and that element',
  '   was gone. Window and capture, so a handler that stops the press at the',
  '   tile - the drag handle does - cannot hide it from this. */',
  'const shelfPresses=new Set();',
  'let shelfPressWaiters=[];',
  'let SHELF_PRESS_MAX_MS=10000;',
  'function shelfPressEnded(){',
  '  shelfPresses.clear();',
  '  const w=shelfPressWaiters; shelfPressWaiters=[];',
  '  /* A task later: the release\'s click is dispatched in this one, and it',
  '     has to find the tile it was pressed on. */',
  '  if(w.length) setTimeout(()=>{ for(const f of w) f(); },0);',
  '}',
  'function shelfPressOver(){',
  '  return new Promise(res=>{',
  '    shelfPressWaiters.push(res);',
  '    /* A release this page never hears must not hold the shelf. */',
  '    setTimeout(()=>{ if(shelfPressWaiters.indexOf(res)>=0) shelfPressEnded(); },SHELF_PRESS_MAX_MS);',
  '  });',
  '}',
  'window.addEventListener("pointerdown",ev=>{',
  '  const b=$("projbody");',
  '  if(b&&ev.target instanceof Node&&b.contains(ev.target)) shelfPresses.add(ev.pointerId);',
  '},true);',
  'for(const type of ["pointerup","pointercancel"])',
  '  window.addEventListener(type,ev=>{',
  '    if(!shelfPresses.delete(ev.pointerId)||shelfPresses.size) return;',
  '    shelfPressEnded();',
  '  },true);',
  'window.addEventListener("blur",()=>{ if(shelfPresses.size) shelfPressEnded(); });',
], 'the read sequence');

swap("  const body=$('projbody'); body.innerHTML='';", [
  '  /* Not while a tile is pressed: the tap would be lost with the tile. Only',
  '     then, so a render with nothing pressed builds in the task that asked. */',
  '  if(shelfPresses.size) await shelfPressOver();',
  "  const body=$('projbody'); body.innerHTML='';",
], 'the tile rebuild');

kit.save(doc, ({ code }) => {
  if (code.split('await shelfPressOver()').length - 1 !== 1) throw new Error('one wait, in renderShelf');
});

fs.renameSync(TMP, FILE);
console.log('patch569 written');
