/* ONE PAGE, THREE PAGES.

   Everything lives in a single scroll of #land, and it has become far too much
   of it: measured on the real collection, Plan rarity alone is 8,312 pixels
   tall and sits between Layers and the traits, so the shelf starts 10,806
   pixels down a page whose first screen is the extractor.

   Three pages, from the owner's own description: the main page is where you
   pull a trait off a character and open art; clicking into a project opens the
   project; and rarity and the other trait parameters live in project settings.

   NOTHING MOVES AND NOTHING GOES. Every section stays exactly where it is in
   the document, keeps its own id, keeps its own hidden logic, and keeps every
   handler already bound to it. A page is a CLASS on the element and an
   attribute on #land, and the CSS hides what is not on the current page. Doing
   it by relocating markup would have moved roughly 240 lines of it past six
   sections that unhide themselves, for no gain a reader could see.

   The pages are addressable - #/project, #/settings - so back and forward
   work, a refresh stays where you were, and a link can point at one. */
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

/* ---- 1. which page each thing is on -------------------------------- */
/* A class rather than a move. Ten edits, each one word, and every section is
   still where the rest of the file expects to find it. */
const PAGE = [
  ['  <p class="tag">', '  <p class="tag pg-home">'],
  ['  <section class="extract">', '  <section class="extract pg-home">'],
  ['  <div class="restore" id="restore" hidden>', '  <div class="restore pg-home" id="restore" hidden>'],
  ['  <div class="drop" id="drop" tabindex="0" role="button" aria-label="Choose a PNG to open">',
    '  <div class="drop pg-home" id="drop" tabindex="0" role="button" aria-label="Choose a PNG to open">'],
  ['  <div class="bulkrow">', '  <div class="bulkrow pg-home">'],
  ['  <button class="mini" id="sortopen"', '  <button class="mini pg-home" id="sortopen"'],
  ['  <section class="proj" id="compose" hidden>', '  <section class="proj pg-project" id="compose" hidden>'],
  ['  <section class="proj" id="proj" hidden>', '  <section class="proj pg-project" id="proj" hidden>'],
  ['  <section class="proj" id="layers" hidden>', '  <section class="proj pg-settings" id="layers" hidden>'],
  ['  <section class="proj" id="plan" hidden>', '  <section class="proj pg-settings" id="plan" hidden>'],
];
for (const [a, b] of PAGE) swap(a, b);

/* ---- 2. the nav ----------------------------------------------------- */
swap(block([
  '  <div class="brand">',
  '    <span class="logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>',
  '    <h1>ChatNFT</h1>',
  '  </div>',
]), block([
  '  <div class="brand">',
  '    <span class="logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span>',
  '    <h1>ChatNFT</h1>',
  '  </div>',
  '  <!-- The three pages. Buttons rather than links: the router owns the hash,',
  '       and a link would let the browser navigate before it could. -->',
  '  <nav class="pagenav" id="pagenav" aria-label="Pages">',
  '    <button type="button" class="pgtab" data-page="home">Main</button>',
  '    <button type="button" class="pgtab" data-page="project">Project</button>',
  '    <button type="button" class="pgtab" data-page="settings">Project settings</button>',
  '  </nav>',
]));

/* ---- 3. the CSS ------------------------------------------------------ */
swap('.brand{display:flex; align-items:center; gap:11px;}', block([
  '.brand{display:flex; align-items:center; gap:11px;}',
  '/* THREE PAGES OUT OF ONE SCROLL.',
  '',
  '   Each thing on the landing page carries the page it belongs to, and #land',
  '   carries the page being shown; these six rules hide the rest. Nothing is',
  '   moved in the document, so every section keeps its own hidden attribute -',
  '   these rules only ever ADD display:none, and never set display back, so a',
  '   section that hides itself because it is empty stays hidden on its own',
  '   page too. */',
  '#land[data-page="home"] .pg-project,',
  '#land[data-page="home"] .pg-settings,',
  '#land[data-page="project"] .pg-home,',
  '#land[data-page="project"] .pg-settings,',
  '#land[data-page="settings"] .pg-home,',
  '#land[data-page="settings"] .pg-project{display:none;}',
  '.pagenav{display:flex; gap:6px; flex-wrap:wrap; justify-content:center;}',
  '.pgtab{font:inherit; font-size:13px; color:var(--muted); background:var(--panel);',
  '  border:1px solid var(--line); border-radius:999px; padding:7px 15px; cursor:pointer;}',
  '.pgtab:hover{color:var(--ink); border-color:var(--muted);}',
  '.pgtab:focus-visible{outline:2px solid var(--accent); outline-offset:2px;}',
  '/* aria-current is the state, and the styling reads it - so the highlight',
  '   cannot drift from what a screen reader is told. */',
  '.pgtab[aria-current="page"]{background:var(--accent-soft); border-color:var(--accent);',
  '  color:var(--accent); font-weight:600;}',
]));

/* ---- 4. the router --------------------------------------------------- */
/* NOT on `$('addlayer').onclick=addLayer;` alone: that line appears TWICE -
   the button is wired in two places, which is pre-existing and harmless and
   would have made this anchor ambiguous. Paired with the line after it. */
swap("$('addlayer').onclick=addLayer;" + NL + "$('expproj').onclick=exportProject;", block([
  '/* ================= pages =========================================',
  '   Three pages out of what was one scroll. The page is a class on each',
  '   thing and an attribute on #land - see the CSS - so nothing here moves an',
  '   element, and every section keeps its own reasons for being hidden.',
  '',
  '   The hash is the page, so back and forward work and a refresh stays where',
  '   you were. An unknown hash is the main page rather than an error: a stale',
  '   link should land somewhere useful. */',
  'const PAGES=["home","project","settings"];',
  'function pageFromHash(){',
  '  const h=String(location.hash||"").replace(/^#\\/?/,"");',
  '  return PAGES.indexOf(h)>=0 ? h : "home";',
  '}',
  'function showPage(p,push){',
  '  const land=$("land"); if(!land) return;',
  '  const want=PAGES.indexOf(p)>=0?p:"home";',
  '  land.setAttribute("data-page",want);',
  '  for(const b of document.querySelectorAll(".pgtab")){',
  '    if(b.dataset.page===want) b.setAttribute("aria-current","page");',
  '    else b.removeAttribute("aria-current");',
  '  }',
  '  /* The hash is written only when a PRESS moved the page. Writing it while',
  '     responding to a hashchange would be answering the browser with what it',
  '     just told us, and on the first render it would put an entry in the',
  '     history for a page nobody navigated to. */',
  '  if(push && pageFromHash()!==want) location.hash="#/"+want;',
  '  /* Back to the top: these are pages, and arriving halfway down one is what',
  '     made the single scroll hard to use in the first place. */',
  '  if(push) window.scrollTo(0,0);',
  '}',
  '(function(){',
  '  for(const b of document.querySelectorAll(".pgtab"))',
  '    b.onclick=()=>showPage(b.dataset.page,true);',
  '  addEventListener("hashchange",()=>showPage(pageFromHash(),false));',
  '  showPage(pageFromHash(),false);',
  '})();',
  "$('addlayer').onclick=addLayer;",
  "$('expproj').onclick=exportProject;",
]));

/* ---- 5. choosing a project opens it ---------------------------------- */
swap("$('wssel').onchange=()=>wsSwitch($('wssel').value||null);",
  block([
    '/* "Click into projects and it opens into the project" - so choosing one',
    '   goes there rather than leaving somebody on the main page wondering',
    '   whether anything happened. */',
    "$('wssel').onchange=()=>{ showPage('project',true); wsSwitch($('wssel').value||null); };",
  ]));

/* ---- CHECKS, then write ---------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['const PAGES=["home","project","settings"];', 'function pageFromHash(){',
  'function showPage(p,push){', 'addEventListener("hashchange"'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const markup = text.slice(0, text.indexOf('<script'));
if (markup.split('id="pagenav"').length !== 2) throw new Error('the nav is not there once');
if (markup.split('class="pgtab"').length !== 4) throw new Error('expected three tabs');
/* Every page must own something, or a tab leads to a blank screen. */
for (const c of ['pg-home', 'pg-project', 'pg-settings'])
  if (markup.split(c).length < 3) throw new Error('nothing is on page: ' + c);

/* NOTHING MOVED. The six sections are still in their original order, which is
   the whole claim this approach rests on. */
const order = ['id="cloud"', 'class="extract pg-home"', 'id="compose"', 'id="layers"',
  'id="plan"', 'id="proj"'];
let at = -1;
for (const s of order) {
  const i = markup.indexOf(s);
  if (i < 0) throw new Error('section vanished: ' + s);
  if (i < at) throw new Error('sections were reordered at: ' + s);
  at = i;
}

/* And the CSS only ever hides. A rule that set display back would override the
   hidden attribute a section uses to say it has nothing to show. */
const style = text.slice(text.indexOf('<style'), text.indexOf('</style>'));
const pageRules = style.slice(style.indexOf('#land[data-page='), style.indexOf('.pagenav{'));
if (/display:(?!none)/.test(pageRules)) throw new Error('a page rule sets display to something other than none');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
