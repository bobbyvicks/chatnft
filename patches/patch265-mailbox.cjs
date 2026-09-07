/* THE MAILBOX: WHICH TRAITS THE GROUP CHANGED, AND WHEN.

   patch264 made a teammate's edit arrive. This says that it did.

   "its hard to know what ones have been edited/updated so can we make almost
   like a mailbox type function where it shows that there was a new edit".
   No names on it, by request - "i dont care to see who edited that much just
   want it to work" - which also means no schema change: updated_at is already
   there and already maintained by a trigger.

   IT SURVIVES A RELOAD, and that is the whole difference between a mailbox and
   a toast. An edit arrives during an automatic sync that runs quiet by design,
   on a page somebody may not be looking at. A message that appears for 1.7
   seconds and is then gone forever has not told anybody anything. So the list
   is written to a settings record and stays on the shelf until it is read.

   IT ALSO CARRIES THE DISAGREEMENTS. A trait a teammate changed while an
   unsaved change to the same trait sits on this device is not an update that
   arrived - it is one that was refused, deliberately, because taking it would
   destroy work that was never sent. Those are the ones actually worth a
   person's attention, so they are named first and separately. */
const kit = require('./pb-repo/tools/patchkit.cjs');

const FILE = 'C:/Users/vicke/AppData/Local/Temp/claude/E--X-content/48e0afff-d993-4de1-93e1-06b35fd035fa/scratchpad/pb-repo/index.html';
const doc = kit.load(FILE);
const L = doc.lines;

/* ---- CHECKS ------------------------------------------------------ */
const fn = kit.inFunction(L, 'async function cloudPull(opts){');
const bits = kit.only(L, l => l === '  const bits=["Loaded "+added+" item"+(added===1?"":"s")];', 'the pull message', fn);
const putRec = kit.only(L, l => l === '        await dbPut(rec); added++;', 'the pulled write', fn);
const decideApply = kit.only(L, l => l === 'function applyDecideOrder(items){', 'a settings neighbour');
const bootCall = kit.only(L, l => l === '  applyBaseColours(items);', 'the boot reads');
/* Where the shelf note lives, so the mailbox has somewhere to be seen. */
const banner = kit.only(L, l => l.indexOf('<p class="note" id="wsbanner"') === 0
  || l.indexOf('      <p class="note" id="wsbanner"') === 0, 'the shelf banner');
kit.only(L, l => l === 'async function renderShelf(){' || l.indexOf('async function renderShelf(') === 0,
  'renderShelf');

/* ---- WRITE, bottom upward ---------------------------------------- */

/* 4. The pull records what came in, and says it. */
kit.replace(L, { start: bits, end: bits }, [
  '  /* KEPT, not just announced. This runs on open, quietly, on a page nobody',
  '     is necessarily watching - a line of toast that lasts 1.7 seconds is not',
  '     a way to learn that somebody rewrote a trait. */',
  '  if(incoming.length||clashed.length) await mailAdd(incoming, clashed);',
  '  const bits=["Loaded "+added+" item"+(added===1?"":"s")];',
  '  if(incoming.length) bits.push(incoming.length+" updated by the group");',
  '  if(clashed.length) bits.push(clashed.length+" you have unsaved changes to, kept");',
]);

/* 3. The puller notes which of the writes were replacements. */
kit.replace(L, { start: putRec, end: putRec }, [
  '        await dbPut(rec); added++;',
  '        /* Recorded where the write is known to have happened, rather than',
  '           where it was decided - a download that failed its three tries is',
  '           not an update that arrived. */',
  '        if(w.incoming) incoming.push({name:w.name, layer:w.layer, at:w.row.updated_at||null});',
]);

/* 2. The store, and the shelf note that shows it. */
kit.replace(L, { start: decideApply, end: decideApply }, [
  '/* WHAT THE GROUP CHANGED SINCE YOU LAST LOOKED.',
  '',
  '   A settings record rather than a variable, because the pull that fills it',
  '   runs on open and runs quiet: the whole point is that it is still there',
  '   when somebody comes back to the page.',
  '',
  '   Capped, and the newest kept. A list that grows without limit becomes a',
  '   thing nobody opens, and the oldest entry in a long one is the least',
  '   worth reading. */',
  "const MAIL_ID='settings.mail';",
  'const MAIL_MAX=60;',
  'let MAIL=[];',
  'function applyMail(items){',
  '  const rec=items.find(i=>i.id===MAIL_ID);',
  '  MAIL = (rec&&Array.isArray(rec.mail)) ? rec.mail.filter(m=>m&&m.name) : [];',
  '}',
  'async function mailSave(){',
  '  try{ await dbPut({id:MAIL_ID, kind:"settings", at:Date.now(), mail:MAIL.slice(0,MAIL_MAX)}); }',
  '  catch(_){ /* a note about a change is not worth failing a pull over */ }',
  '}',
  'async function mailAdd(updated, kept){',
  '  const seen=Date.now();',
  '  /* Newest first, and one entry per trait: the same trait edited twice',
  '     before anybody looked is one thing to look at, not two. */',
  '  const add=[];',
  '  for(const u of updated) add.push({name:u.name, layer:u.layer||null, at:u.at||null, kind:"updated", seen});',
  '  for(const n of kept) add.push({name:n, layer:null, at:null, kind:"clash", seen});',
  '  const by=new Map();',
  '  for(const m of add.concat(MAIL)) if(!by.has(m.kind+"/"+m.name)) by.set(m.kind+"/"+m.name, m);',
  '  MAIL=[...by.values()].slice(0,MAIL_MAX);',
  '  await mailSave();',
  '}',
  'async function mailClear(){ MAIL=[]; await mailSave(); mailShow(); }',
  '/* Shown on the shelf, where the traits it is talking about are. A count is',
  '   not enough on its own - "3 traits updated" and no names is a thing you',
  '   have to go looking for - so the names are in the line itself. */',
  'function mailShow(){',
  '  const el=$("mailnote"); if(!el) return;',
  '  if(!MAIL.length){ el.hidden=true; el.textContent=""; return; }',
  '  const upd=MAIL.filter(m=>m.kind==="updated"), cl=MAIL.filter(m=>m.kind==="clash");',
  '  const list=a=>a.slice(0,6).map(m=>m.name).join(", ")+(a.length>6?" and "+(a.length-6)+" more":"");',
  '  const bits=[];',
  '  if(upd.length) bits.push(upd.length+" trait"+(upd.length===1?"":"s")+" updated by the group: "+list(upd));',
  '  if(cl.length) bits.push(cl.length+" kept because you have unsaved changes: "+list(cl));',
  '  el.hidden=false;',
  '  el.textContent=bits.join(" \\u2014 ")+".";',
  '  el.className="note mail";',
  '  const b=document.createElement("button");',
  '  b.className="mini"; b.textContent="Mark as read";',
  '  b.style.marginLeft="8px";',
  '  b.onclick=mailClear;',
  '  el.appendChild(b);',
  '}',
  'function applyDecideOrder(items){',
]);

/* 1b. Read at boot with the rest, and drawn with the shelf. */
kit.replace(L, { start: bootCall, end: bootCall }, [
  '  applyBaseColours(items);',
  '  applyMail(items);',
]);

/* 1a. Somewhere to put it. */
kit.replace(L, { start: banner, end: banner }, [
  L[banner],
  '      <!-- What the group changed since you last looked. Beside the project',
  '           banner because it is about this project and about these traits. -->',
  '      <p class="note mail" id="mailnote" hidden style="width:100%;margin:0 0 6px"></p>',
]);

const grew = kit.save(doc, ({ lines, text, code }) => {
  const has = s => lines.filter(l => l === s).length;
  if ((text.match(/id="mailnote"/g) || []).length !== 1) throw new Error('the note is not in the page once');
  if (has('  applyMail(items);') !== 1) throw new Error('the mail is not read at boot');
  for (const f of ['function applyMail(items){', 'async function mailSave(){',
    'async function mailAdd(updated, kept){', 'function mailShow(){'])
    if (has(f) !== 1) throw new Error('missing ' + f);
  /* The pull really fills it, rather than the store existing unused. */
  if (code.indexOf('await mailAdd(incoming, clashed);') < 0) throw new Error('the pull never fills the mailbox');
  if (code.indexOf('if(w.incoming) incoming.push(') < 0) throw new Error('nothing records an arrival');
});

console.log('index.html grew by ' + grew + ' bytes');
