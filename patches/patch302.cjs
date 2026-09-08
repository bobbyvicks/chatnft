/* THE PAGE ROUTER RE-ENTERED ITSELF, AND THE UPDATES LIST DOUBLED.

   Measured: three rows on the server rendered as six on screen, under a
   heading correctly reading "the last 3, most recent first". The count and the
   list disagreed, which is the tell.

   showPage writes location.hash when a press moved the page. Writing it fires
   hashchange, which calls showPage again - harmless while the function only
   toggled classes, and not harmless once it also STARTS SOMETHING. Both calls
   ran renderUpdates, both emptied the list, both awaited the network, and both
   appended their three rows to a list the other had already cleared.

   Two guards, because they are two different faults.

   The router does nothing when it is already where it is being sent. That is
   the re-entry, and it also stops a no-op press scrolling the page to the top.

   And renderUpdates refuses to have two runs in flight. The router is not the
   only caller - Check again is a button somebody can press twice - and a list
   that is emptied by one run while another is filling it is wrong however it
   was reached. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. the router does not re-enter -------------------------------- */
swap(block([
  '  const want=PAGES.indexOf(p)>=0?p:"home";',
  '  land.setAttribute("data-page",want);',
]), block([
  '  const want=PAGES.indexOf(p)>=0?p:"home";',
  '  /* ALREADY HERE, SO NOTHING TO DO. Writing the hash below fires',
  '     hashchange, which calls this again - harmless while it only toggled',
  '     classes, and not harmless once it also starts a request: both calls ran',
  '     renderUpdates, both emptied the list, and both appended to what the',
  '     other had cleared. Measured as three rows on the server showing as six.',
  '',
  '     It also stops a press on the page you are already on jumping you to the',
  '     top of it. On the first render the attribute is unset, so this never',
  '     blocks the one call that has to happen. */',
  '  if(land.getAttribute("data-page")===want) return;',
  '  land.setAttribute("data-page",want);',
]));

/* ---- 2. and the list refuses two runs at once ----------------------- */
swap(block([
  'const UPDATE_ROWS=25;',
  'async function renderUpdates(){',
  '  const sec=$("updates"); if(!sec) return;',
]), block([
  'const UPDATE_ROWS=25;',
  '/* One run at a time. The router is not the only caller - Check again is a',
  '   button somebody can press twice - and a list emptied by one run while',
  '   another is filling it is wrong however it was reached. A second request',
  '   would also be answering a question the first is already answering. */',
  'let updatesBusy=false;',
  'async function renderUpdates(){',
  '  const sec=$("updates"); if(!sec) return;',
  '  if(updatesBusy) return;',
  '  updatesBusy=true;',
  '  try{ await renderUpdatesNow(sec); } finally{ updatesBusy=false; }',
  '}',
  'async function renderUpdatesNow(sec){',
]));

/* ---- CHECKS, then write --------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['  if(land.getAttribute("data-page")===want) return;',
  'let updatesBusy=false;', '  if(updatesBusy) return;',
  'async function renderUpdatesNow(sec){'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* The guard has to release even when the work throws, or one failed request
   makes the panel permanently refuse to refresh. */
if (code.indexOf('finally{ updatesBusy=false; }') < 0)
  throw new Error('the busy flag is not released on failure');

/* And the early return must come BEFORE the attribute is written, or it can
   never be true. */
const sp = code.slice(code.indexOf('function showPage(p,push){'));
const guardAt = sp.indexOf('if(land.getAttribute("data-page")===want) return;');
const writeAt = sp.indexOf('land.setAttribute("data-page",want);');
if (guardAt < 0 || writeAt < 0 || guardAt > writeAt)
  throw new Error('the re-entry guard is after the write it guards against');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
