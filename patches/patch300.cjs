/* THE RULES SECTION NEVER APPEARED.

   Moving the rules into their own section gave them their own `hidden`
   attribute, and nothing takes it down. renderShelf raises and lowers #proj,
   #compose and #layers by hand, and the new section was not in that list - so
   the settings page showed Layers and Plan rarity and simply no rules, with
   every control present in the document and invisible.

   Found by looking at the page rather than by the section's own test, which is
   the useful part: the markup checks all passed, every id was where it should
   be, and the thing was still not on screen.

   It follows #compose exactly. Both are about the collection as a whole rather
   than about one trait, both are meaningless with nothing in the project, and
   both are already taken down together on the two early exits. */
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

/* Both early exits, and the ordinary path - the same three places #compose is
   named, because they are the same question about the same thing. */
swap("  try{ items=await dbAll(); }catch(_){ $('proj').hidden=true; $('compose').hidden=true;" + NL
  + "    $('layers').hidden=true; return; }",
  "  try{ items=await dbAll(); }catch(_){ $('proj').hidden=true; $('compose').hidden=true;" + NL
  + "    $('layers').hidden=true; $('rules').hidden=true; return; }");

swap("  if(!items.length){ $('compose').hidden=true; $('layers').hidden=true; return; }",
  "  if(!items.length){ $('compose').hidden=true; $('layers').hidden=true;" + NL
  + "    $('rules').hidden=true; return; }");

/* And raised where compose is. buildCompose is what fills the panel, so the
   rules follow the same call rather than a second decision about when there is
   something to show. */
swap("  buildLayerPanel(items);" + NL + "  renderPlan(items);",
  "  buildLayerPanel(items);" + NL
  + "  /* The rules are about the collection, like Build a character, and are"
  + NL + "     meaningless with nothing in it - so they appear and go together. */"
  + NL + "  $('rules').hidden=$('compose').hidden;" + NL + "  renderPlan(items);");

/* ---- CHECKS, then write --------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

if (code.indexOf("  $('rules').hidden=$('compose').hidden;") < 0)
  throw new Error('the rules section is never shown');

/* EVERY PLACE compose IS HIDDEN, rules IS TOO. Counted rather than assumed:
   the defect was precisely a list that had one fewer entry than it needed. */
const hideCompose = (code.match(/\$\('compose'\)\.hidden=true/g) || []).length;
const hideRules = (code.match(/\$\('rules'\)\.hidden=true/g) || []).length;
if (hideCompose !== hideRules)
  throw new Error('compose is hidden in ' + hideCompose + ' places and rules in ' + hideRules);

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
