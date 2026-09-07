/* "YOU NEED TO UPDATE RARITY TO FINISH PROJECT" HAS TO BE SAID WHERE THE
   PROJECT IS BEING FINISHED.

   Plan rarity counts what is unplanned and says so at its own heading, but it
   is folded by default - a section of 271 sliders opening itself on every load
   would bury the shelf - so somebody who adds a trait and goes straight to
   Download all would never see it.

   Download all is the literal finish: it is the zip that goes to the mint. So
   the count is said there too, from the SAME function the section's heading
   uses, because a number that appears twice from two counts is a number that
   will eventually disagree with itself.

   Not a block. A weight of 1 is a legitimate choice and refusing to download
   over one would invent a rule nobody asked for; this says it once, at the
   moment the consequence is about to happen. */
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

/* ---- one counter, two places that say it ---------------------------- */
swap(block([
  'function renderPlan(items){',
  '  const sec=$("plan"); if(!sec) return;',
  '  const wip=!!($("cwip")&&$("cwip").checked);',
]), block([
  '/* How many traits the generator would draw and nobody has given a rarity.',
  '',
  '   ONE COUNTER. The heading of Plan rarity and the Download all message both',
  '   say this number, and two counts of one thing is how they come to disagree.',
  '   A hidden set is excluded for the same reason its shares are: nothing in it',
  '   is drawn, so nothing in it can be missing from a plan. */',
  'function unplannedCount(items,wip){',
  '  let n=0;',
  '  for(const layer of LAYERS){',
  '    if(HIDDEN_LAYERS.has(layer)) continue;',
  '    for(const t of planRows(items,layer,wip)) if(!rarityPlanned(t)) n++;',
  '  }',
  '  return n;',
  '}',
  '/* The sentence, or "" when there is nothing to say - so a caller cannot',
  '   treat "the plan is finished" as truthy. */',
  'function unplannedLine(items,wip){',
  '  const n=unplannedCount(items,wip);',
  '  if(!n) return "";',
  '  return " \\u2014 "+n+" trait"+(n===1?"":"s")+" still "+(n===1?"needs":"need")',
  '    +" a rarity to finish this project. Plan rarity is above the traits.";',
  '}',
  '',
  'function renderPlan(items){',
  '  const sec=$("plan"); if(!sec) return;',
  '  const wip=!!($("cwip")&&$("cwip").checked);',
]));

/* ---- and Download all says it ---------------------------------------- */
swap(block([
  "  toast('Downloaded '+items.length+' trait'+(items.length===1?'':'s')",
  "    +(refs.length?' and '+refs.length+' base character'+(refs.length===1?'':'s'):'')",
  '    +(zcen.oddCount',
  '    ? " \\u2014 "+zcen.oddCount+" not "+zcen.want+" ("+zcen.detail+"). A trait has to divide into whole cells to line up."',
  '    : ""));',
]), block([
  '  /* The plan, at the moment the project is being finished. Plan rarity is',
  '     folded by default, so somebody who adds a trait and comes straight here',
  '     would otherwise never be told. Same counter as the section heading. */',
  "  const rline=unplannedLine(all,$('cwip')?$('cwip').checked:false);",
  "  toast('Downloaded '+items.length+' trait'+(items.length===1?'':'s')",
  "    +(refs.length?' and '+refs.length+' base character'+(refs.length===1?'':'s'):'')",
  '    +(zcen.oddCount',
  '    ? " \\u2014 "+zcen.oddCount+" not "+zcen.want+" ("+zcen.detail+"). A trait has to divide into whole cells to line up."',
  '    : "")+rline);',
]));

/* ---- the heading reads the same counter ------------------------------ */
swap(block([
  '  const total=planned+unplanned;',
  '  $("plancount").textContent = unplanned',
  '    ? planned+" of "+total+" set. "+unplanned+" to go before this is finished."',
  '    : "Every trait has a rarity.";',
]), block([
  '  /* Counted here as well as by unplannedCount, and they must agree - the',
  '     loop above already has the rows in hand, so re-walking them would be a',
  '     second pass for nothing. Asserted rather than assumed: if the two ever',
  '     part, the section is the first thing that would notice and this is',
  '     where it says so. */',
  '  const total=planned+unplanned;',
  '  const cross=unplannedCount(items,wip);',
  '  $("plancount").textContent = unplanned',
  '    ? planned+" of "+total+" set. "+unplanned+" to go before this is finished."',
  '      +(cross===unplanned?"":" (and something is wrong: two counts of this"',
  '        +" disagree, "+unplanned+" against "+cross+")")',
  '    : "Every trait has a rarity.";',
]));

/* ---- CHECKS, then write ---------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function unplannedCount(items,wip){', 'function unplannedLine(items,wip){',
  '+rline);', '  const cross=unplannedCount(items,wip);'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* The hidden-set rule must be the same one the shares use, not a copy. */
if (code.indexOf('    if(HIDDEN_LAYERS.has(layer)) continue;\r\n    for(const t of planRows(items,layer,wip)) if(!rarityPlanned(t)) n++;') < 0)
  throw new Error('unplannedCount does not use planRows');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
