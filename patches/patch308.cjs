/* REMOVING THE v7 SHORTCUT AND THE MARKETING CARDS, BY REQUEST.

   Three things go.

   "Load reviewed v7 collection rules" and "Download v7 for LaunchMyNFT", with
   the paragraph under them about the renamed 249-trait collection. The button
   was a shortcut into one specific bundle; its whole implementation lives in
   curated-rules-v7.js, which is loaded on every page for it and is reachable
   from nothing else, so the script tag and the file go with it.

   THE RULES THEMSELVES ARE NOT DELETED. rules/trait-rules-strict-fit-v7.json
   and rules/strict-fit-v7-collection.json stay exactly where they are, and
   "Import rules from a file" still reads either one. What is being removed is
   a shortcut, not the data behind it - deleting somebody's rule set because
   they asked for a tidier panel would be a different thing entirely.

   And the Measures / Recovers / Edits cards on the main page, which describe
   the app to somebody who has not used it. The person using this has, and the
   space is wanted for the last ten things they edited.

   tests/rulesbutton.spec.js goes too. It exists to prove that button is wired
   to something - its own header says a fake-DOM test "is structurally unable
   to notice the button being dead" - and a test for a button that is not there
   is not a passing test, it is a missing one. test/curated-rules.test.cjs and
   its npm script go with the module they cover. */
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function cut(from) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  text = text.split(from).join('');
}
function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. the v7 shortcut ----------------------------------------------- */
cut(block([
  '    <div class="olrow" style="margin-top:8px">',
  '      <!-- The id carries no version. It was rulev6, and chasing that through',
  '           four files twice is what a version in a name costs; the bundle',
  '           knows its own revision and the label says it. -->',
  '      <button class="mini" id="rulesload">Load reviewed v7 collection rules</button>',
  '      <a class="mini" href="rules/trait-rules-strict-fit-v7.json" download>Download v7 for LaunchMyNFT</a>',
  '    </div>',
  '    <p class="note">For the renamed 249-trait collection. Loads the stricter fit decisions and sets the draw order: eyes, glasses, then hats; masks last. Your team\'s own Yes/No answers still take priority. Continue editing them in Review pairs above.</p>',
  '',
]));

cut(block(['<script src="curated-rules-v7.js"></script>', '']));

/* ---- 2. the cards ------------------------------------------------------ */
cut(block([
  '  <div class="how pg-home">',
  '    <div><h3>Measures</h3><p>Finds the real block size and suggests a resolution.</p></div>',
  '    <div><h3>Recovers</h3><p>Rebuilds each cell from its own pixels. No new colours.</p></div>',
  '    <div><h3>Edits</h3><p>Paint on the true grid, download a clean PNG.</p></div>',
  '  </div>',
  '',
  '',
]));

cut(block([
  '.how{display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr));',
  '  gap:14px; width:min(760px,92vw); text-align:left;}',
  '.how div{padding:15px 16px; border-radius:11px; background:var(--panel); border:1px solid var(--line);}',
  '.how h3{font-size:12px; text-transform:uppercase; letter-spacing:.1em; color:var(--accent); margin-bottom:5px;}',
  '.how p{margin:0; color:var(--muted); font-size:13px; line-height:1.5;}',
  '',
]));

swap('.err{order:5} .extract{order:6} .proj{order:7} .how{order:8}',
  '.err{order:5} .extract{order:6} .proj{order:7} .recent{order:8}');

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

/* GONE FROM THE WHOLE FILE, not just from the block that was cut - a leftover
   handler for an element that no longer exists throws on load. */
for (const dead of ['rulesload', 'curated-rules-v7', 'class="how', 'Measures',
  'Recovers', 'trait-rules-strict-fit-v7'])
  if (text.indexOf(dead) >= 0)
    throw new Error('still referenced after removal: ' + dead);

/* AND THE ORDERING STILL COVERS EVERY MAIN-PAGE BLOCK. `.how` held order 8;
   dropping it without giving 8 to something would leave the next section
   unordered and it would jump to the top of the grid. */
if (text.indexOf('.recent{order:8}') < 0)
  throw new Error('nothing took the ordering slot the cards had');

/* THE RULES DATA IS UNTOUCHED. Only the shortcut was asked for. */
for (const keep of ['ruleimport', 'ruleexport', 'ruleclear'])
  if (text.indexOf('id="' + keep + '"') < 0)
    throw new Error('removed more than the shortcut: ' + keep);

fs.writeFileSync(FILE, text);
console.log('index.html shrank by ' + (before.length - text.length) + ' bytes');
