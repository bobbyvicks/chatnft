/* LAYERS AT THE TOP OF SETTINGS, RARITY UNDER IT.

   "ive also asked for it to be at the top of settings with rarity below it
   and then the traits after"

   The settings page ran What changed, then Rules, then Layers, then Plan
   rarity - so the two panels that are about the collection itself were
   underneath a changelog and a rule list. Layers is now first and the rarity
   plan is directly under it, and everything else follows.

   THE TWO MOVE TOGETHER AND IN ONE PIECE. They are already adjacent in the
   file, so this lifts one block and puts it down ahead of the first settings
   section rather than rewriting the page - nothing inside either section is
   touched, which is what keeps every id, handler and test that reaches into
   them working.

   THE TRAITS ARE NOT ON THIS PAGE. The shelf is #proj, which carries
   pg-project, and the settings page hides pg-project - so "the traits after"
   is already where it can be: they are the next page rather than the next
   section, and putting them into settings would be a second copy of the
   shelf rather than a reorder. Said here because the request asked for three
   things in an order and this delivers two of them in that order. */
const fs = require('fs');
const path = require('path');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const LIVE = path.join(__dirname, '..', 'index.html');
const TMP = LIVE + '.new';
fs.copyFileSync(LIVE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const OPEN_LAYERS = '  <section class="proj pg-settings" id="layers" hidden>';
const OPEN_PLAN = '  <section class="proj pg-settings" id="plan" hidden>';
const OPEN_PROJ = '  <section class="proj pg-project" id="proj" hidden>';
const OPEN_UPDATES = '  <section class="proj pg-settings" id="updates" hidden>';

const from = kit.only(L, l => l === OPEN_LAYERS, 'the layers section');
const plan = kit.only(L, l => l === OPEN_PLAN, 'the rarity section');
const shelf = kit.only(L, l => l === OPEN_PROJ, 'the shelf section');
/* ADJACENT, AND IN THIS ORDER. If anything is ever put between them this
   would lift it along with them, silently. */
if (!(from < plan && plan < shelf))
  throw new Error('the sections are not in the order this expects');
if (L[plan - 1] !== '  </section>')
  throw new Error('layers does not end where plan begins');
const to = shelf - 1;
if (L[to] !== '  </section>')
  throw new Error('plan does not end where the shelf begins');

const block = L.slice(from, to + 1);
if (block.filter(l => l.indexOf('<section ') >= 0).length !== 2)
  throw new Error('the block being moved is not exactly the two sections');

const before = kit.only(L, l => l === OPEN_UPDATES, 'the first settings section');
if (before > from)
  throw new Error('the first settings section is already after layers');

/* Cut, then paste - in that order, because removing lines above the
   destination would shift it. */
kit.replace(L, { start: from, end: to }, []);
const dest = kit.only(L, l => l === OPEN_UPDATES, 'the first settings section, again');
kit.replace(L, { start: dest, end: dest - 1 }, block);

const bytes = kit.save(doc, ({ text }) => {
  const ix = (s) => text.indexOf(s);
  const layers = ix(OPEN_LAYERS), plan2 = ix(OPEN_PLAN),
    updates = ix(OPEN_UPDATES), shelf2 = ix(OPEN_PROJ);
  for (const [n, v] of [['layers', layers], ['plan', plan2], ['updates', updates], ['proj', shelf2]])
    if (v < 0) throw new Error('the ' + n + ' section went missing');
  /* THE ORDER THAT WAS ASKED FOR. */
  if (!(layers < plan2)) throw new Error('rarity is not under layers');
  if (!(plan2 < updates)) throw new Error('layers and rarity are not first');
  /* EXACTLY ONE OF EACH. A cut-and-paste that pasted without cutting reads
     as a working page until two panels fight over the same ids. */
  for (const s of [OPEN_LAYERS, OPEN_PLAN, OPEN_UPDATES, OPEN_PROJ])
    if (text.split(s).length - 1 !== 1)
      throw new Error('a section was duplicated or lost: ' + s);
  /* AND THE PIECES INSIDE THEM CAME ALONG. */
  for (const id of ['layerbody', 'layercount', 'newlayer', 'addlayer',
    'planbody', 'plancount', 'planfold', 'planseedall'])
    if (text.indexOf('id="' + id + '"') < 0)
      throw new Error('the move dropped #' + id);
  /* The shelf is still on the project page and not dragged into settings. */
  if (!/<section class="proj pg-project" id="proj" hidden>/.test(text))
    throw new Error('the shelf changed page');
});

fs.renameSync(TMP, LIVE);
console.log('index.html ' + (bytes < 0 ? bytes : '+' + bytes) + ' bytes');
