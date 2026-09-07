/* THE TRAIT ORGANISER FOLDS.

   "make it so you can collapse and open the trait organizer".

   It is by far the tallest thing on the page - 272 tiles, and the shelf alone
   measured 10,522px with the collection loaded - and Build a character and the
   layer list now sit above it, so everything below the shelf is a very long
   way down. Folding it is the difference between scrolling past the whole
   collection and stepping over it.

   THE IDIOM IS THE ONE THE SIDE PANEL ALREADY USES: a heading you press, a
   .folded class, an arrow that turns, and the choice remembered. Nothing new
   is invented for this, which also means the keyboard and the aria state come
   free because that heading is already a button.

   WHAT STAYS VISIBLE WHEN IT IS FOLDED, and this is the part worth getting
   right. Only the tiles go. The heading keeps its count, so a folded shelf
   reads as "272 traits, put away" rather than as an empty project - which is
   the way this feature goes wrong, and it goes wrong silently because a person
   who thinks their traits are gone does not report a folding bug. The mailbox
   stays too: what the group changed is exactly the thing you must not have to
   unfold something to notice. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

/* ---- CHECKS ------------------------------------------------------ */
const head = kit.only(L, l => l === '      <h2>Your project</h2>', 'the shelf heading');
const body = kit.only(L, l => l === '    <div id="projbody"></div>', 'the shelf body');
if (body < head) throw new Error('the body does not follow the heading');
const css = kit.only(L, l => l === '.projhead h2{font-size:13px; text-transform:uppercase; letter-spacing:.1em; color:var(--accent);}',
  'the panel heading rule');
const sideKey = kit.only(L, l => l === 'const SIDE_KEY="chatnft.sidedown";', 'the side panel key');
/* renderShelf is what fills the body, and it must keep filling it while
   folded - a fold that empties the shelf would lose the scroll position and
   make unfolding slow. */
kit.only(L, l => l === 'async function renderShelf(){', 'renderShelf');

/* ---- WRITE, bottom upward ---------------------------------------- */

/* 3. The behaviour, beside the side panel's, because it is the same idea. */
kit.replace(L, { start: sideKey, end: sideKey }, [
  'const SIDE_KEY="chatnft.sidedown";',
  '/* THE SHELF FOLDS TOO, and for a stronger reason than the side panel: the',
  '   shelf is 272 tiles and measured 10,522px with the collection loaded, so',
  '   everything below it is further away than anybody scrolls.',
  '',
  '   Only the tiles are hidden. The heading keeps its count, so a folded shelf',
  '   says "272 traits" rather than looking like an empty project - which is how',
  '   this feature goes wrong, and it goes wrong quietly, because somebody who',
  '   believes their work has vanished does not file it as a folding bug. */',
  'const PROJ_KEY="chatnft.projfold";',
  'function projFold(on,remember){',
  '  const sec=$("proj"), h=$("projfold");',
  '  if(!sec) return;',
  '  sec.classList.toggle("folded",!!on);',
  '  if(h){',
  '    h.setAttribute("aria-expanded", on?"false":"true");',
  '    h.title = on ? "Show the traits" : "Hide the traits";',
  '  }',
  '  /* remember:false - restoring a choice is not making one. */',
  '  if(remember!==false){ try{ localStorage.setItem(PROJ_KEY, on?"1":"0"); }catch(_){} }',
  '}',
  '(function(){',
  '  const h=$("projfold"); if(!h) return;',
  '  h.onclick=()=>projFold(!$("proj").classList.contains("folded"));',
  '  let want=false; try{ want=localStorage.getItem(PROJ_KEY)==="1"; }catch(_){}',
  '  projFold(want,false);',
  '})();',
]);

/* 2. The markup: a real button, so it is reachable by keyboard without any
      code of its own. */
kit.replace(L, { start: head, end: head }, [
  '      <!-- A button rather than a heading with a handler: the keyboard, the',
  '           focus ring and the aria state all come free, and this is the same',
  '           shape the side panel sections already use. -->',
  '      <h2><button class="projfold" id="projfold" type="button" aria-controls="projbody"',
  '        aria-expanded="true" title="Hide the traits">Your project<span class="fold"'
  + ' aria-hidden="true">\u25be</span></button></h2>',
]);

/* 1. The look. */
kit.replace(L, { start: css, end: css }, [
  '.projhead h2{font-size:13px; text-transform:uppercase; letter-spacing:.1em; color:var(--accent);}',
  '/* The heading is the control. Inherit rather than restate: the h2 above',
  '   already carries the size, the tracking and the colour, and a button',
  '   resets all three. */',
  '.projfold{font:inherit; color:inherit; letter-spacing:inherit; text-transform:inherit;',
  '  display:inline-flex; align-items:center; gap:7px; cursor:pointer; padding:0;}',
  '.projfold:hover{color:var(--ink);}',
  '.projfold:focus-visible{outline:2px solid var(--accent); outline-offset:3px; border-radius:4px;}',
  '.projfold .fold{font-size:13px; line-height:1; color:var(--dim); transition:transform .15s;}',
  '#proj.folded .projfold .fold{transform:rotate(-90deg);}',
  '/* ONLY the tiles. The count, the notes and the buttons stay - a folded shelf',
  '   has to say how much is in it, or it reads as an empty project. */',
  '#proj.folded #projbody{display:none;}',
  '#proj.folded .shelfvisibility,#proj.folded .shelfpick{display:none;}',
]);

const grew = kit.save(doc, ({ lines, text, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if ((text.match(/id="projfold"/g) || []).length !== 1) throw new Error('the control is not there once');
  if (has('#proj.folded #projbody{display:none;}') !== 1) throw new Error('folding hides nothing');
  if (code.indexOf('function projFold(on,remember){') < 0) throw new Error('projFold did not land');
  /* Wired, or it is a button that does nothing - the hazard this file names. */
  if (code.indexOf('h.onclick=()=>projFold(') < 0) throw new Error('the control is not wired');
  /* Remembered, and restored without being re-remembered. */
  if (code.indexOf('localStorage.setItem(PROJ_KEY') < 0) throw new Error('the choice is not kept');
  if (code.indexOf('projFold(want,false);') < 0) throw new Error('the choice is not restored');
  /* The count is NOT hidden. This is the assertion that keeps a folded shelf
     from reading as an empty project. */
  if (code.indexOf('#proj.folded #projcount') >= 0 || text.indexOf('#proj.folded .projhead{display:none') >= 0)
    throw new Error('folding hides the count');
});

console.log('index.html grew by ' + grew + ' bytes');
