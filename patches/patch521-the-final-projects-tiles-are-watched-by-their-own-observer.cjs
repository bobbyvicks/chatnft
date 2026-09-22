/* THE FINAL PROJECT'S TILES ARE WATCHED BY THEIR OWN OBSERVER.

   Reported 2026-09-21: "in final project i added a skin and then it made it
   so that i couldnt see any previews of the other traits".

   Every tile canvas is painted lazily. shelfTile registers it on shelfWatch,
   an IntersectionObserver, and the picture is decoded when the observer
   reports the tile on screen - which it does at the browser's next rendering
   step, never on the next line of code. renderShelf rebuilds that observer
   (shelfWatchReset disconnects the old one) because the shelf's own tiles go
   with the DOM it empties, and that is right for the shelf.

   The final project page borrowed the same observer. So every tile it drew
   was registered on an object the shelf throws away on its next redraw, and
   a canvas whose observer is disconnected before it has reported is never
   painted by anything. finalMove redraws this page and then the shelf, a few
   milliseconds apart; whether the observer reported in between is a race
   against the frame clock, which is why it usually looked fine and did not
   for the person reporting it. Measured on the page before this change with
   the preview made instant: four tiles waiting at the moment of the reset,
   four tiles blank afterwards. finalSort had met the same race earlier and
   ordered its two redraws around it; the pick bar copied that order. Neither
   covers a shelf redraw that comes from somewhere else - a pull finishing, a
   rarity change, a hide - while this page's tiles below the fold are still
   waiting, and on a project of three hundred traits most of them are.

   So this page gets an observer of its own, reset when it empties its own
   host and touched by nothing else. The observer itself is built in one
   place for both pages; the two resets differ only in which page they belong
   to. The ordering comments on finalSort and the pick bar are superseded
   rather than deleted: the order they chose is still fine, it is just no
   longer what keeps the pictures on the page. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };

/* ---- 1. one constructor, two observers --------------------------------- */
{
  const fn = kit.inFunction(L, 'function shelfWatchReset(){');
  kit.replace(L, { start: fn.start, end: fn.end }, [
    '/* THE OBSERVER, built in one place for the two pages that paint tiles',
    '   lazily. Each page holds its own and resets it when it empties its own',
    '   host - see finalWatchReset for why they must not share one. */',
    'function tileWatch(){',
    '  if(typeof IntersectionObserver!=="function") return null;',
    '  return new IntersectionObserver(function(entries,obs){',
    '    for(const e of entries){',
    '      if(!e.isIntersecting) continue;',
    '      obs.unobserve(e.target);',
    '      const paint=e.target.pbPaint;',
    '      if(paint){ e.target.pbPaint=null; paint(); }',
    '    }',
    '  },{rootMargin:"400px 0px"});',
    '}',
    'function shelfWatchReset(){',
    '  if(shelfWatch){ shelfWatch.disconnect(); shelfWatch=null; }',
    '  shelfWatch=tileWatch();',
    '}',
    "/* THE FINAL PROJECT PAGE'S OWN. Its tiles used to register on shelfWatch,",
    '   and a canvas whose observer is disconnected before it has reported is',
    '   never painted by anything - so every shelf redraw was a race against the',
    '   frame clock for every tile on that page still waiting, which on a',
    '   project of three hundred traits is most of them. finalMove lost it:',
    '   this page redrawn, the shelf redrawn a few milliseconds later, and',
    '   "i couldnt see any previews of the other traits". Measured with the',
    '   preview made instant: four tiles waiting at the reset, four blank after.',
    '   Reset by renderFinal when it empties its host, and by nothing else. */',
    'let finalWatch=null;',
    'function finalWatchReset(){',
    '  if(finalWatch){ finalWatch.disconnect(); finalWatch=null; }',
    '  finalWatch=tileWatch();',
    '}',
  ]);
}

/* ---- 2. the tile takes the observer it belongs on ----------------------- */
{
  const fn = kit.inFunction(L, 'function shelfTile(rec){');
  kit.replace(L, { start: fn.start, end: fn.end }, [
    "/* watch is the observer this tile belongs on. Left out, it is the shelf's;",
    '   the final project passes its own. null paints at once. */',
    'function shelfTile(rec,watch){',
    '  const cv=thumbCanvas(rec);',
    '  const w=(arguments.length>1)?watch:shelfWatch;',
    '  if(w){ cv.pbPaint=function(){ thumbPaint(cv,rec&&rec.blob); }; w.observe(cv); }',
    '  else thumbPaint(cv,rec&&rec.blob);',
    '  return cv;',
    '}',
  ]);
}
swap('  el.appendChild(shelfTile(t));', ['  el.appendChild(shelfTile(t,finalWatch));'], 'the final tile');

/* ---- 3. the page resets its own when it empties its own host ------------ */
{
  const fn = kit.inFunction(L, 'async function renderFinal(){');
  swap('  host.innerHTML="";', [
    '  host.innerHTML="";',
    "  /* With the DOM the old observer was watching - this page's, not the",
    "     shelf's. See finalWatchReset. */",
    '  finalWatchReset();',
  ], 'the final host emptied', fn);
}

/* ---- 4. the two ordering comments are superseded ------------------------ */
swap('     After commitShelfMove rather than before, because it ends with', [
  '     After commitShelfMove rather than before. This used to be what kept',
  '     the pictures on the page: the shelf redraw at the end of the move',
  '     reset the IntersectionObserver these tiles were registered on. Since',
  '     patch521 this page has an observer of its own and the order is only',
  '     the natural one - the move first, then the page that shows it. */',
], 'finalSort comment 1');
{
  const i = at('     renderShelf and renderShelf resets the IntersectionObserver every tile', 'finalSort comment 2');
  kit.replace(L, { start: i, end: i + 2 }, []);
}
swap('   this page is drawn afterwards, which is also the order that leaves its', [
  '   this page is drawn afterwards. That order used to be what kept its tiles',
  '   on a live IntersectionObserver; since patch521 the page has its own and',
  '   the order is only the natural one. */',
], 'pick bar comment');
{
  const i = at('   tiles on a live IntersectionObserver. */', 'pick bar comment 2');
  kit.replace(L, { start: i, end: i }, []);
}

/* ---- what has to be true afterwards ------------------------------------ */
const NL = String.fromCharCode(10);
const grew = kit.save(doc, ({ code, text }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('function tileWatch(){');
  once('new IntersectionObserver(');
  once('shelfWatch=tileWatch();');
  once('finalWatch=tileWatch();');
  once('function shelfTile(rec,watch){');
  once('shelfTile(t,finalWatch)');
  once('finalWatchReset();');
  once('function finalWatchReset(){');
  /* Nothing else observes, and the shelf's reset is still where it was. */
  once('.observe(cv)');
  once('shelfWatchReset();');
  /* renderFinal resets its own right where it empties its host. */
  const rf = code.indexOf('async function renderFinal(){');
  const emptied = code.indexOf('host.innerHTML="";', rf);
  const reset = code.indexOf('finalWatchReset();', rf);
  if (emptied < 0 || reset < 0 || reset - emptied > 200) throw new Error('renderFinal does not reset its observer where it empties its host');
  /* renderShelf IS UNTOUCHED. */
  const was = kit.code(kit.scriptOf(doc.original));
  const slice = (src, head) => { const a = src.indexOf(head); const b = src.indexOf(NL + '}', a); return src.slice(a, b); };
  if (code.indexOf('async function renderShelf(viewOnly){') < 0) throw new Error('renderShelf head not found');
  if (slice(code, 'async function renderShelf(viewOnly){') !== slice(was, 'async function renderShelf(viewOnly){')) throw new Error('renderShelf changed');
  /* The stale reason is gone from both comments, and the superseding one is
     there - on the raw text, because `code` has no comments in it and a
     check on it would pass by never looking. */
  if (text.indexOf('order that leaves its') >= 0) throw new Error('pick bar comment not superseded');
  if (text.indexOf('renderShelf resets the IntersectionObserver every tile') >= 0) throw new Error('finalSort comment not superseded');
  for (const s of ['since patch521 the page has its own', 'patch521 this page has an observer of its own',
    "THE FINAL PROJECT PAGE'S OWN."]) if (text.indexOf(s) < 0) throw new Error('missing comment: ' + s);
});

fs.renameSync(TMP, FILE);
console.log('patch521 written, ' + grew + ' bytes');
