/* THE FINAL REVIEW QUEUE: the state, the load, and a trait id that survives.

   The handoff seeds 317 traits with stable ids, a sequence, the layer, the
   original and current names, a source hash and a pending final-pass state -
   and asks for a pass that goes through them one at a time.

   A STABLE ID IS THE PART THIS APP DID NOT HAVE. A trait's key here is
   "t_"+name+"_"+layer+"_"+status, so renaming it makes a different record; the
   whole point of the queue is that entry 12 stays entry 12 after it is renamed
   and re-approved. Re-keying IndexedDB is a much larger change and would touch
   every path in the file, so the queue's id is carried as a FIELD - reviewId -
   and saveTrait carries it across a rename exactly as it already carries the
   rarity and the server row. That gives identity that outlives a rename
   without moving the store under everything that reads it.

   MATCHED, NOT ASSUMED. An entry finds its trait by layer and name, with the
   .png stripped, and the load reports how many entries found nothing rather
   than quietly reviewing 300 of 317. A name that matches two traits is left
   unmatched for the same reason the rules import refuses an ambiguous name.

   AND NOTHING IS APPROVED BY LOADING IT. The file arrives with 316 pending and
   one in review, and the handoff is explicit that existing approval is not
   final-pass approval. The load never sets artworkAccepted or nameAccepted -
   only a person pressing a button does. */
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

/* ---- 1. the state ------------------------------------------------------ */
swap("const RULES_ID='settings.rules';", block([
  "const RULES_ID='settings.rules';",
  "/* THE FINAL REVIEW PASS. One record holding the whole queue: the entries in",
  "   order, and which one is open. Metadata only - the pictures are the traits",
  "   themselves, which are already in the store. */",
  "const REVIEW_ID='settings.review';",
  'let REVIEW=null;',
]));

swap(block([
  'function applyDecisions(items){',
]), block([
  '/* The queue as it was last left, or null when no pass has been started. */',
  'function applyReview(items){',
  '  const rec=(items||[]).find(i=>i.id===REVIEW_ID);',
  '  REVIEW=(rec&&Array.isArray(rec.entries)&&rec.entries.length)',
  '    ? {revision:rec.revision||null, activeId:rec.activeId||null,',
  '       entries:rec.entries.map(e=>Object.assign({},e))}',
  '    : null;',
  '}',
  'async function saveReview(){',
  '  if(!REVIEW) return;',
  '  await dbPut({id:REVIEW_ID, kind:"settings", at:Date.now(),',
  '    revision:REVIEW.revision, activeId:REVIEW.activeId,',
  '    entries:REVIEW.entries.map(e=>Object.assign({},e))});',
  '}',
  '/* A queue entry names its trait the way the folder does, with the extension.',
  '   The store does not. */',
  'const reviewBase=n=>String(n||"").replace(/\\.png$/i,"");',
  '/* The entry a trait belongs to, by the id stamped on it. Falls back to layer',
  '   and name for a trait that has not been stamped yet - which is every trait',
  '   until the queue is first loaded. */',
  'function entryForTrait(t){',
  '  if(!REVIEW||!t) return null;',
  '  if(t.reviewId){ const byId=REVIEW.entries.find(e=>e.id===t.reviewId); if(byId) return byId; }',
  '  return REVIEW.entries.find(e=>(e.layer||"")===(t.layer||"")',
  '    && reviewBase(e.currentName)===t.name) || null;',
  '}',
  'function applyDecisions(items){',
]));

/* ---- 2. loading a queue file ------------------------------------------ */
swap(block([
  'async function importRuleFile(f){',
]), block([
  '/* Starting a final review pass from the seeded queue.',
  '',
  '   The file is metadata: ids, order, names, hashes and a pending state. The',
  '   pictures are the traits already in this project, so the load is really a',
  '   matching problem - and it says how much of it failed rather than quietly',
  '   reviewing whatever it managed to pair up.',
  '',
  '   A name that two traits on one layer answer to is left unmatched, on the',
  '   same reasoning planRuleImport uses: a guess here attaches somebody\'s',
  '   review to the wrong artwork.',
  '',
  '   NOTHING IS APPROVED BY BEING LOADED. The handoff is explicit that earlier',
  '   approval is not final-pass approval, and the file arrives with 316 pending',
  '   for exactly that reason. */',
  'async function importReviewQueue(f){',
  '  if(!f) return false;',
  '  const note=$("reviewnote"); if(note) note.hidden=false;',
  '  const say=m=>{ if(note) note.textContent=m; };',
  '  say("Reading "+f.name+"\\u2026");',
  '  let doc;',
  '  try{ doc=JSON.parse(await f.text()); }',
  '  catch(err){ say("Could not read that file: "+(err&&err.message||"it is not valid JSON")+"."); return false; }',
  '  const list=(doc&&Array.isArray(doc.traits))?doc.traits:(Array.isArray(doc)?doc:null);',
  '  if(!list||!list.length){ say("That file has no review queue in it."); return false; }',
  '  /* Ids are the whole point of the queue, so a file whose ids repeat is',
  '     refused rather than half-loaded. */',
  '  const ids=new Set();',
  '  for(const e of list){ if(!e||!e.id||ids.has(e.id)){',
  '    say("That queue has entries with missing or repeated ids, so it was not loaded."); return false; }',
  '    ids.add(e.id); }',
  '  let items=[]; try{ items=(await dbAll()).filter(i=>i.kind==="trait"); }catch(_){}',
  '  /* How many traits answer to each layer+name, so an ambiguous one can be',
  '     left alone rather than guessed at. */',
  '  const by=new Map(), dupes=new Set();',
  '  for(const t of items){',
  '    const k=(t.layer||"")+"/"+t.name;',
  '    if(by.has(k)) dupes.add(k); else by.set(k,t);',
  '  }',
  '  const entries=[], missing=[], ambiguous=[];',
  '  let stamped=0;',
  '  for(const e of list){',
  '    const layer=String(e.layer||"");',
  '    const name=reviewBase(e.currentName||e.originalName);',
  '    const k=layer+"/"+name;',
  '    const t=dupes.has(k)?null:by.get(k);',
  '    if(dupes.has(k)) ambiguous.push(k);',
  '    else if(!t) missing.push(k);',
  '    entries.push({id:e.id, sequence:e.sequence||entries.length+1, layer:layer,',
  '      originalName:e.originalName||e.currentName||name,',
  '      currentName:e.currentName||e.originalName||name,',
  '      finalName:e.finalName||null, sourceSha256:e.sourceSha256||null,',
  '      width:e.width||null, height:e.height||null,',
  '      /* Never carried over from the file: this pass starts unreviewed. */',
  '      artworkAccepted:false, nameAccepted:false, skipped:false});',
  '    if(t && t.reviewId!==e.id){',
  '      try{ await dbPut(Object.assign({},t,{reviewId:e.id})); stamped++; }catch(_){}',
  '    }',
  '  }',
  '  entries.sort((a,b)=>(a.sequence||0)-(b.sequence||0));',
  '  REVIEW={revision:(doc&&doc.collectionRevision)||null,',
  '    activeId:(doc&&doc.activeTraitId)||entries[0].id, entries:entries};',
  '  if(!REVIEW.entries.some(e=>e.id===REVIEW.activeId)) REVIEW.activeId=entries[0].id;',
  '  await saveReview();',
  '  /* The same order the rules file carries, applied the same way. */',
  '  let painted=null;',
  '  if(doc&&Array.isArray(doc.order)){',
  '    try{ painted=await applyPaintOrder(doc.order.map(String)); }catch(_){ painted=null; }',
  '  }',
  '  await renderShelf();',
  '  const bits=["Review pass started: "+entries.length+" trait"+(entries.length===1?"":"s")];',
  '  if(stamped) bits.push(stamped+" matched to what is here");',
  '  if(missing.length) bits.push(missing.length+" named by the queue "+(missing.length===1?"is":"are")',
  '    +" not in this project"+(missing.length<=4?" ("+missing.join(", ")+")":""));',
  '  if(ambiguous.length) bits.push(ambiguous.length+" name"+(ambiguous.length===1?"":"s")',
  '    +" matched more than one trait and "+(ambiguous.length===1?"was":"were")+" left unmatched");',
  '  if(painted) bits.push("the paint order is now the file\'s");',
  '  say(bits.join(". ")+".");',
  '  return true;',
  '}',
  'async function importRuleFile(f){',
]));

/* ---- 3. the id survives a rename -------------------------------------- */
swap(block([
  '      if(typeof openRec.rarity==="number") rec.rarity=openRec.rarity;',
  '      if(openRec.rowId) rec.rowId=openRec.rowId;',
]), block([
  '      if(typeof openRec.rarity==="number") rec.rarity=openRec.rarity;',
  '      if(openRec.rowId) rec.rowId=openRec.rowId;',
  '      /* AND THE QUEUE ENTRY. The record key carries the name, so a rename',
  '         makes a different record - which is exactly the thing a review pass',
  '         must survive. Entry 12 is still entry 12 after it is renamed. */',
  '      if(openRec.reviewId) rec.reviewId=openRec.reviewId;',
]));

/* ---- 4. loaded with everything else ----------------------------------- */
swap(block([
  '  applyDecisions(items);',
]), block([
  '  applyDecisions(items);',
  '  applyReview(items);',
]));

/* ---- CHECKS, then write ------------------------------------------------ */
if (text === before) throw new Error('nothing changed');
const script = kit.scriptOf(text);
const code = kit.code(script);
// eslint-disable-next-line no-new-func
new Function(script);

for (const s of ["const REVIEW_ID='settings.review';", 'let REVIEW=null;',
  'function applyReview(items){', 'async function saveReview(){',
  'async function importReviewQueue(f){', 'function entryForTrait(t){',
  '      if(openRec.reviewId) rec.reviewId=openRec.reviewId;',
  '  applyReview(items);'])
  if (code.indexOf(s) < 0) throw new Error('did not land: ' + s);

const iStart = code.indexOf('async function importReviewQueue(f){');
const iEnd = code.indexOf('\r\nasync function importRuleFile(', iStart);
if (iStart < 0 || iEnd < 0) throw new Error('could not bound importReviewQueue');
const imp = code.slice(iStart, iEnd);

/* NOTHING ARRIVES APPROVED. The handoff says existing approval is not
   final-pass approval, and honouring the file's own flags would import an
   approval nobody in this pass gave. */
if (imp.indexOf('artworkAccepted:false, nameAccepted:false') < 0)
  throw new Error('the load carries approval in from the file');
if (/artworkAccepted:\s*(e\.|!!e|Boolean)/.test(imp))
  throw new Error('approval is read from the file rather than started clean');

/* AN AMBIGUOUS NAME IS LEFT ALONE, not attached to whichever trait was seen
   first - that would put somebody's review on the wrong artwork. */
if (imp.indexOf('dupes.has(k)?null:by.get(k)') < 0)
  throw new Error('a name matching two traits is still matched to one of them');

/* AND A QUEUE WITH REPEATED IDS IS REFUSED. The id is the only thing here that
   is supposed to be stable. */
if (imp.indexOf('missing or repeated ids') < 0)
  throw new Error('a queue with duplicate ids would half-load');

fs.writeFileSync(FILE, text);
console.log('index.html grew by ' + (text.length - before.length) + ' bytes');
