/* PROJECT SETTINGS IS A PLACE INSIDE THE PROJECT, NOT A THIRD TAB - AND THE
   RULES GO IN IT.

   Three things, all from one complaint that the project page is cluttered.

   1. Settings stops being a top-level tab and becomes a button you press while
      you are in the project, with a way back. It is not a peer of the project;
      it is where the project's knobs live. The tab bar is Main and Project,
      and Project stays lit while you are in its settings, because you have not
      left it.

   2. The rules - Never together, Review pairs, the LaunchMyNFT import and
      export, and the v7 bundle - move out of Build a character and into
      settings. THIS ONE REALLY MOVES MARKUP, unlike the page split, and it has
      to: those controls sit INSIDE #compose, and a child cannot escape a
      hidden parent. They become their own section with their own heading,
      which is what they always were - forty lines of trait parameters wedged
      under a character preview.

      Every id is unchanged, so every handler bound by id still finds its
      control, and the checks below prove all fourteen of them survived.

   3. Randomise becomes Randomize, on the button and in the sentences around
      it. The app's own prose is otherwise British - colour 285 times, grey 12,
      recognise 7 - so this is deliberately only the word that was asked about
      rather than a silent rewrite of the other 300. */
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

/* ---- 1. cut the rules out of Build a character --------------------- */
const START = '    <!-- The other half of "look for traits that collide rather than stack".';
const END = "    <p class=\"note\">For the renamed 249-trait collection. Loads the stricter fit decisions and sets the draw order: eyes, glasses, then hats; masks last. Your team's own Yes/No answers still take priority. Continue editing them in Review pairs above.</p>";
const s0 = text.indexOf(START);
const s1 = text.indexOf(END);
if (s0 < 0 || s1 < 0 || s1 < s0) throw new Error('could not find the rules block');
const rules = text.slice(s0, s1 + END.length);
/* It must be the whole of it and nothing else: the block ends where #compose
   does, so an off-by-one here would carry a </section> with it. */
if (rules.indexOf('</section>') >= 0) throw new Error('the cut reaches past the section');
for (const id of ['rulea', 'ruleb', 'ruleadd', 'rulelist', 'rulestate', 'revtrait',
  'revlayer', 'revopen', 'revcover', 'ruleimport', 'ruleexport', 'ruleimportnote',
  'rulefile', 'rulesload'])
  if (rules.indexOf('id="' + id + '"') < 0) throw new Error('the cut misses ' + id);
text = text.slice(0, s0) + text.slice(s1 + END.length);

/* ---- 2. paste it in as its own section, on the settings page -------- */
swap('  <section class="proj pg-settings" id="layers" hidden>', block([
  '  <!-- The trait parameters. They lived inside Build a character, under the',
  '       character preview, which is where they were written rather than where',
  '       they belong: forty lines of rules under a picture. Moved whole, with',
  '       every id intact, so every handler still finds its control. -->',
  '  <section class="proj pg-settings" id="rules" hidden>',
  '    <div class="projhead">',
  '      <h2>Trait rules</h2>',
  '      <span class="count">which traits can share a character</span>',
  '    </div>',
  rules,
  '  </section>',
  '  <section class="proj pg-settings" id="layers" hidden>',
]));

/* ---- 3. settings is a button in the project, not a tab -------------- */
swap(block([
  '  <nav class="pagenav" id="pagenav" aria-label="Pages">',
  '    <button type="button" class="pgtab" data-page="home">Main</button>',
  '    <button type="button" class="pgtab" data-page="project">Project</button>',
  '    <button type="button" class="pgtab" data-page="settings">Project settings</button>',
  '  </nav>',
]), block([
  '  <!-- Two tabs, because settings is not a peer of the project - it is where',
  '       the project\'s knobs live. You get there from inside it, and back the',
  '       same way. -->',
  '  <nav class="pagenav" id="pagenav" aria-label="Pages">',
  '    <button type="button" class="pgtab" data-page="home">Main</button>',
  '    <button type="button" class="pgtab" data-page="project">Project</button>',
  '    <button type="button" class="pgjump pg-project" id="tosettings"',
  '      data-page="settings">Project settings</button>',
  '    <button type="button" class="pgjump pg-settings" id="toproject"',
  '      data-page="project">\u2190 Back to the project</button>',
  '  </nav>',
]));

swap('.pgtab[aria-current="page"]{background:var(--accent-soft); border-color:var(--accent);',
  block([
    '/* A jump, not a tab: it goes somewhere rather than naming where you are, so',
    '   it never carries aria-current and is not styled as the place you stand. */',
    '.pgjump{font:inherit; font-size:13px; color:var(--muted); background:none;',
    '  border:1px dashed var(--line); border-radius:999px; padding:7px 15px; cursor:pointer;}',
    '.pgjump:hover{color:var(--ink); border-color:var(--muted);}',
    '.pgjump:focus-visible{outline:2px solid var(--accent); outline-offset:2px;}',
    '.pgtab[aria-current="page"]{background:var(--accent-soft); border-color:var(--accent);',
  ]));

/* ---- 4. the router knows settings is part of the project ------------ */
swap(block([
  '  for(const b of document.querySelectorAll(".pgtab")){',
  '    if(b.dataset.page===want) b.setAttribute("aria-current","page");',
  '    else b.removeAttribute("aria-current");',
  '  }',
]), block([
  '  for(const b of document.querySelectorAll(".pgtab")){',
  '    /* Project stays lit while you are in its settings. You have not left the',
  '       project to change its rarity - settings is a room inside it, and a tab',
  '       bar showing nothing selected would say otherwise. */',
  '    const here = b.dataset.page===want',
  '      || (want==="settings" && b.dataset.page==="project");',
  '    if(here) b.setAttribute("aria-current","page");',
  '    else b.removeAttribute("aria-current");',
  '  }',
]));

swap(block([
  '  for(const b of document.querySelectorAll(".pgtab"))',
  '    b.onclick=()=>showPage(b.dataset.page,true);',
]), block([
  '  /* Tabs and jumps alike: both are "go to this page", and binding only the',
  '     tabs is how the settings button would have looked broken. */',
  '  for(const b of document.querySelectorAll(".pgtab,.pgjump"))',
  '    b.onclick=()=>showPage(b.dataset.page,true);',
]));

/* ---- 5. Randomise -> Randomize -------------------------------------- */
for (const [a, b] of [
  ['<button class="mini" id="crand">Randomise</button>', '<button class="mini" id="crand">Randomize</button>'],
  ['title="How often a layer is left out when randomising.">empty', 'title="How often a layer is left out when randomizing.">empty'],
  ['  let t="How often a layer is left out when randomising.";', '  let t="How often a layer is left out when randomizing.";'],
  ["      rar.title='How often this is picked by Randomise and the sheet. '+RAR_NORMAL+' is normal,'",
    "      rar.title='How often this is picked by Randomize and the sheet. '+RAR_NORMAL+' is normal,'"],
]) swap(a, b);

/* ---- CHECKS, then write --------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

const markup = text.slice(0, text.indexOf('<script'));
/* EVERY RULES CONTROL SURVIVED THE MOVE, exactly once, and is now on the
   settings page rather than inside Build a character. */
const rulesSec = markup.slice(markup.indexOf('id="rules"'), markup.indexOf('id="layers"'));
for (const id of ['rulea', 'ruleb', 'ruleadd', 'rulelist', 'rulestate', 'revtrait',
  'revlayer', 'revopen', 'revcover', 'ruleimport', 'ruleexport', 'ruleimportnote',
  'rulefile', 'rulesload']) {
  if (markup.split('id="' + id + '"').length !== 2)
    throw new Error('control lost or duplicated in the move: ' + id);
  if (rulesSec.indexOf('id="' + id + '"') < 0)
    throw new Error('control did not land in the rules section: ' + id);
}
/* And Build a character kept its own. */
const compose = markup.slice(markup.indexOf('id="compose"'), markup.indexOf('id="rules"'));
for (const id of ['ccanvas', 'crows', 'cnote', 'crand', 'cgen', 'csheet'])
  if (compose.indexOf('id="' + id + '"') < 0) throw new Error('compose lost ' + id);

if (markup.split('class="pgtab"').length !== 3) throw new Error('expected two tabs now');
if (markup.split('id="tosettings"').length !== 2) throw new Error('no way into settings');
if (markup.split('id="toproject"').length !== 2) throw new Error('no way back');
if (code.indexOf('.pgtab,.pgjump') < 0) throw new Error('the jumps are not wired');

/* The word, everywhere a person reads it. */
if (/[Rr]andomis/.test(markup)) throw new Error('a visible Randomise survived');
for (const s of ['id="crand">Randomize<', 'randomizing.">empty'])
  if (markup.indexOf(s) < 0) throw new Error('did not land: ' + s);

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
