/* THE CLEAR LOCKED ITSELF TOO LATE.

   The button was disabled after the confirmation, which leaves the whole
   measuring phase - a user lookup, a team lookup, a collection lookup and a
   row count, every one of them a network round trip - open to a second press.
   Two presses there means two confirmations for one collection, and answering
   both starts two clears against the same prefix.

   Caught by its own test, which read `disabled` immediately after the call and
   found it false. The test was right and the guard was in the wrong place.

   Split the way renderUpdates already is in this file: a thin wrapper that
   takes the lock on the first synchronous line and releases it in a finally,
   and the work in a function underneath. Every early return - not signed in,
   nothing on the server, Cancel - passes through the same finally, so the
   button cannot be left dead by a path that declined to do anything. */
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

swap(block([
  'async function clearCloud(){',
  '  const note=$("cloudnote");',
]), block([
  '/* ONE AT A TIME, taken on the first synchronous line.',
  '',
  '   Disabling the button after the confirmation left the measuring phase open',
  '   - four round trips - so a second press there produced a second dialog for',
  '   the same collection, and answering both started two clears. Same shape as',
  '   renderUpdates: the lock and the button live in the wrapper, the work lives',
  '   underneath, and every early return passes through one finally so a path',
  '   that decided to do nothing cannot leave the button dead. */',
  'let clearingCloud=false;',
  'async function clearCloud(){',
  '  if(clearingCloud) return;',
  '  clearingCloud=true;',
  '  const btn=$("cloudclear"); if(btn) btn.disabled=true;',
  '  try{ await clearCloudNow(); }',
  '  finally{ clearingCloud=false; if(btn) btn.disabled=false; }',
  '}',
  'async function clearCloudNow(){',
  '  const note=$("cloudnote");',
]));

swap(block([
  '  const btn=$("cloudclear");',
  '  if(btn){ btn.disabled=true; }',
  '  say("Clearing the server\\u2026");',
]), block([
  '  say("Clearing the server\\u2026");',
]));

swap(block([
  "    say(\"Something went wrong part way through. Press it again - it is safe to repeat.\");",
  '  }finally{ if(btn) btn.disabled=false; }',
  '}',
]), block([
  "    say(\"Something went wrong part way through. Press it again - it is safe to repeat.\");",
  '  }',
  '}',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['let clearingCloud=false;', '  if(clearingCloud) return;',
  'async function clearCloudNow(){',
  '  finally{ clearingCloud=false; if(btn) btn.disabled=false; }'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* THE LOCK IS TAKEN BEFORE ANYTHING THAT AWAITS. If it moved below the first
   await this is the version that was just fixed. */
const wStart = code.indexOf('async function clearCloud(){');
const wEnd = code.indexOf('async function clearCloudNow(){');
if (wStart < 0 || wEnd < 0 || wEnd < wStart) throw new Error('could not bound the wrapper');
const wrap = code.slice(wStart, wEnd);
if (wrap.indexOf('await') !== wrap.indexOf('await clearCloudNow()'))
  throw new Error('the wrapper awaits something before taking the lock');
if (wrap.indexOf('if(clearingCloud) return;') > wrap.indexOf('clearingCloud=true;'))
  throw new Error('the guard is set before it is checked');

/* AND IT IS ALWAYS RELEASED. A clear that throws must not leave the button
   dead for the rest of the session - the one state worse than not clearing. */
if (wrap.indexOf('finally{') < 0)
  throw new Error('a failed clear would leave the button disabled for ever');

/* The old inner release is gone, or the button is re-enabled halfway. */
const nStart = code.indexOf('async function clearCloudNow(){');
const nEnd = code.indexOf('\r\nasync function cloudStatus(', nStart);
const body = code.slice(nStart, nEnd);
if (body.indexOf('btn.disabled') >= 0)
  throw new Error('the work still touches the button the wrapper owns');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
