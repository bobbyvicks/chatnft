/* A ROW THE SERVER REFUSED IS NOT A ROW THE SERVER HAS NOT SEEN.

   setRarity cleared `synced` on any failed patch, which is right for one kind
   of failure and wrong for the other:

     unreachable - offline, a dropped request, a 5xx. The group really is
                   behind, and clearing `synced` is what gets the row sent
                   again. The cost is that cloudPush re-uploads the picture,
                   which is the honest price of being behind.
     refused     - the value breaks a constraint. Sending it again cannot
                   help: it will be refused again, and every push in between
                   re-uploads a 1280x1280 PNG for nothing.

   THIS IS NOT HYPOTHETICAL AND IT IS ABOUT TO HAPPEN. The page now allows
   weights to 5000; the live column still checks 1..99 until the constraint is
   widened, and widening it is a separate step. In that window "Set the rest to
   normal" writes 100 to every unplanned trait - 271 of them - and every one is
   refused. Under the old rule that cleared `synced` on all 271, so the next
   push would have re-uploaded the entire collection, about a gigabyte, to send
   numbers the server would refuse again.

   So the two are told apart and only the first clears the flag. The refusal
   already says so on screen; what this adds is that it does not also queue a
   pointless upload. */
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

/* ---- cloudRarity says WHICH kind of failure ------------------------ */
swap(block([
  '   Returns false when there is nobody to tell - no group, or a record that',
  '   has never been pushed and therefore has no row to patch. The caller reads',
  '   that as "still local", not as a failure. */',
  'async function cloudRarity(rec){',
  '  if(!activeWs || !rec || !rec.rowId) return false;',
  '  try{',
  '    const h=await sbHeaders({"Content-Type":"application/json"});',
  '    if(!h) return false;',
]), block([
  '   Returns WHICH kind of outcome, not a boolean, because the caller has to',
  '   tell two failures apart:',
  '',
  '     "ok"          the group has it.',
  '     "nogroup"     there is nobody to tell - no group, or a record never',
  '                   pushed and so having no row to patch. Not a failure.',
  '     "unreachable" offline, dropped, a 5xx. The group really is behind.',
  '     "refused"     the value breaks a constraint. Sending it again cannot',
  '                   help, and every attempt costs a picture upload.',
  '',
  '   A boolean collapsed the last two, and they want opposite handling. */',
  'async function cloudRarity(rec){',
  '  if(!activeWs || !rec || !rec.rowId) return "nogroup";',
  '  try{',
  '    const h=await sbHeaders({"Content-Type":"application/json"});',
  '    if(!h) return "unreachable";',
]));

swap(block([
  '    if(r&&r.ok) return true;',
]), block([
  '    if(r&&r.ok) return "ok";',
]));

swap(block([
  '    let why=""; try{ why=await r.text(); }catch(_){ }',
  '    if(r && r.status===400 && /rarity/i.test(why))',
  '      toast("The group will not take a rarity of "+rec.rarity',
  '        +" - its limit is lower than this page allows. Saved here only.");',
  '    return false;',
  '  }catch(_){ return false; }',
]), block([
  '    let why=""; try{ why=await r.text(); }catch(_){ }',
  '    if(r && r.status===400 && /rarity/i.test(why)){',
  '      toast("The group will not take a rarity of "+rec.rarity',
  '        +" - its limit is lower than this page allows. Saved here only.");',
  '      return "refused";',
  '    }',
  '    return "unreachable";',
  '  }catch(_){ return "unreachable"; }',
]));

/* ---- and setRarity acts on the difference -------------------------- */
swap(block([
  '  const sent=await cloudRarity(next);',
  '  if(!sent && activeWs && next.rowId && next.synced) await dbPut({...next, synced:false});',
]), block([
  '  const sent=await cloudRarity(next);',
  '  /* ONLY "unreachable" clears the flag. A refused row will be refused again,',
  '     and cloudSyncOne re-uploads the PNG on every attempt - so marking 271',
  '     refused traits unsynced would queue about a gigabyte to re-send numbers',
  '     the server is going to reject a second time. "nogroup" clears nothing',
  '     either: there was never anything to be behind. */',
  '  if(sent==="unreachable" && next.rowId && next.synced) await dbPut({...next, synced:false});',
]));

/* ---- CHECKS, then write -------------------------------------------- */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ['  if(!activeWs || !rec || !rec.rowId) return "nogroup";',
  '    if(r&&r.ok) return "ok";', '      return "refused";',
  '    return "unreachable";',
  '  if(sent==="unreachable" && next.rowId && next.synced) await dbPut({...next, synced:false});'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

/* The boolean must be gone from both ends, or one of them keeps collapsing
   the two failures it exists to separate. */
if (code.indexOf('if(!sent && activeWs') >= 0) throw new Error('the caller still reads a boolean');
if (code.indexOf('  }catch(_){ return false; }\r\n}\r\n\r\n/* Write one weight') >= 0)
  throw new Error('cloudRarity still returns false on a throw');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
