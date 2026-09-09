/* A DECISION ALREADY MADE IS NOT WORK TO DO AGAIN.

   The review import throws away every accepted flag in the file, with the
   handoff's own reasoning: existing approval is not final-pass approval, and a
   pass that started claiming work nobody in it had done would be worse than
   useless.

   That was right about the file it was written for, and is now wrong about the
   file being used. Measured, both queues, today:

     the packaged handoff   317 traits, 0 with approvedRevision, 0 accepted
     the live review queue  317 traits, 1 with approvedRevision, 1 accepted

   The difference is a field, not a mood. `reviewStatus: "approved"` is the
   collection saying a trait is good - which is exactly the thing the rule was
   right to ignore. `approvedRevision` is a RECORD OF THE FINAL PASS: when it
   was approved, the sha of what was approved, where the file went, and the
   user's own words. On the live queue that field reads "name is good and edit
   is good" against The Backrooms.

   So the rule keeps its teeth and gains a hinge: a flag is adopted only when
   the entry carries that record. A bare status still means nothing. And the
   import SAYS how many it took and from whom, because silently starting a pass
   with entries already ticked is the same failure in the other direction.
*/
const fs = require('fs');
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
let text = fs.readFileSync(FILE, 'utf8');
const before = text;
const NL = '\r\n';

function swap(from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error('expected exactly 1 of: ' + from.slice(0, 70) + ' (found ' + n + ')');
  if (from === to) throw new Error('the swap changes nothing');
  text = text.split(from).join(to);
}
const block = a => a.join(NL);

/* ---- 1. what counts as a decision already made -------------------------- */
swap(block([
  'async function importReviewQueue(f){',
]), block([
  '/* THE FINAL PASS LEAVES A RECORD; A COLLECTION STATUS DOES NOT.',
  '',
  '   reviewStatus:"approved" is the collection saying a trait is good, which is',
  '   the thing this pass exists to re-decide. approvedRevision is the pass\'s',
  '   own receipt - when, the sha of what was approved, where it went, and the',
  '   words the person used. Only the receipt is evidence.',
  '',
  '   Measured on the two real queues: the packaged handoff carries 0 of these',
  '   across 317 traits, the live one carries 1. The old rule threw away nothing',
  '   in the first case and the wrong thing in the second. */',
  'function reviewDecided(e){',
  '  const r=e&&e.approvedRevision;',
  '  if(!r||typeof r!=="object") return null;',
  '  /* A receipt with nothing in it is not a receipt. */',
  '  if(!r.approvedAt&&!r.approvedSha256&&!r.userApproval) return null;',
  '  return {artwork:e.artworkAccepted!==false, name:e.nameAccepted!==false,',
  '    said:(typeof r.userApproval==="string"&&r.userApproval)||null,',
  '    at:r.approvedAt||null};',
  '}',
  'async function importReviewQueue(f){',
]));

/* ---- 2. adopt it, and count it ------------------------------------------ */
swap(block([
  '      /* Never carried over from the file: this pass starts unreviewed. */',
  '      artworkAccepted:false, nameAccepted:false, skipped:false});',
]), block([
  '      /* CARRIED OVER ONLY FROM A RECEIPT. A bare status still starts this',
  '         pass unreviewed, which is what the handoff asked for; a recorded',
  '         final-pass decision is work somebody already did. */',
  '      artworkAccepted:!!(decided&&decided.artwork),',
  '      nameAccepted:!!(decided&&decided.name),',
  '      approvedRevision:decided?e.approvedRevision:null,',
  '      skipped:false});',
]));

swap(block([
  '    if(dupes.has(k)) ambiguous.push(k);',
]), block([
  '    const decided=reviewDecided(e);',
  '    if(decided) already.push({name:name, said:decided.said});',
  '    if(dupes.has(k)) ambiguous.push(k);',
]));

swap(block([
  '  const bits=["Review pass started: "+entries.length+" trait"+(entries.length===1?"":"s")];',
  '  if(stamped) bits.push(stamped+" matched to what is here");',
]), block([
  '  const bits=["Review pass started: "+entries.length+" trait"+(entries.length===1?"":"s")];',
  '  if(stamped) bits.push(stamped+" matched to what is here");',
  '  /* SAID, not silent. Starting a pass with entries already ticked, without',
  '     saying which or why, is the same failure the old rule guarded against',
  '     pointing the other way. */',
  '  if(already.length) bits.push(already.length+" already decided in the file"',
  '    +(already.length<=3',
  '      ? " ("+already.map(a=>a.name+(a.said?": \\u201c"+a.said+"\\u201d":"")).join("; ")+")"',
  '      : ""));',
]));

/* The list itself, declared with the others. */
swap(block([
  '  const entries=[], missing=[], ambiguous=[];',
]), block([
  '  const entries=[], missing=[], ambiguous=[], already=[];',
]));

/* ---- CHECKS, then write ------------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['function reviewDecided(e){', 'const decided=reviewDecided(e);',
  'artworkAccepted:!!(decided&&decided.artwork),',
  'if(already.length) bits.push(already.length+" already decided in the file"'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* A BARE STATUS IS STILL NOT EVIDENCE. The whole point of the original rule,
   and the half that must survive this change. */
const dStart = code.indexOf('function reviewDecided(e){');
const decided = code.slice(dStart, dStart + 700);
if (decided.indexOf('reviewStatus') >= 0)
  throw new Error('the status field crept back into what counts as a decision');
if (decided.indexOf('if(!r||typeof r!=="object") return null;') < 0)
  throw new Error('an entry with no receipt is no longer refused');
if (decided.indexOf('if(!r.approvedAt&&!r.approvedSha256&&!r.userApproval) return null;') < 0)
  throw new Error('an empty receipt now counts as a decision');

/* AND THE ADOPTION READS THE RECEIPT, not the entry's own flags alone. */
const iStart = code.indexOf('async function importReviewQueue(f){');
const imp = code.slice(iStart, iStart + 5000);
if (imp.indexOf('artworkAccepted:!!(decided&&decided.artwork),') < 0)
  throw new Error('the flags are not gated on the receipt');
if (imp.split('const decided=reviewDecided(e);').length !== 2)
  throw new Error('the receipt is read somewhere other than once per entry');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
