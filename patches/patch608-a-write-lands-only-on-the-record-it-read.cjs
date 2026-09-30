/* FOLLOW-UP A (after stage 0, on 91eb861's page): A WRITE LANDS ONLY ON THE
   RECORD IT READ.

   The page reads a record, waits, and writes. Another tab of the same
   project - or a pull, or this tab's own later press - can change the
   record in between, or move it to a new id (a status change, a move to
   another layer) or remove it. A write that does not read, in its own
   transaction, what the id holds now then writes over the change, or puts
   the record back under the id it left: two records for one row, and
   removing either removes the row on the server. Every item below was
   reproduced RED on 91eb861's page before anything here was built (the
   specs named with each).

   S3 + I7 (tests/pullwritesonlywhatitplanned.spec.js). s0SameAsPlanned,
   the re-id's plan check, compared sameRepair's eleven fields and `at`.
   Another tab's folder import writes s0Replaces (s0StandsIn, when the
   server cannot be told), and the re-id wrote the plan's copy over the
   pairing. It now compares every field either record holds, and the
   picture by size and type (never by object: every read gives a new Blob).

   S5 (the same spec). The pull's same-id repair write had no plan check:
   another tab's unsent weight was written over, and a trait another tab
   had moved was written back under its old id. dbPut takes the planned
   record as an optional fourth argument, `was`, reads the id in its own
   transaction, and puts only if the store still holds it. The write stays
   a dbPut, where two specs this batch does not own count and hold it
   (quietopenwritesnothing, stage0stamps' sign-out at the write).

   S7 (tests/retiredidstaysretired.spec.js). setRarity's write ahead (a
   dbGet, then a dbPut: two transactions), its write back, setRarityMany's
   second write - and its first, which wrote the caller's copies (found
   and measured here, the same shape) - commitShelfMove's rollback, and
   cloudPatchOne's "sent" write (the same shape again, measured): each now
   reads and writes in one transaction. A new helper beside s0ReidTx,
   s0WriteIfTx, reads every id a write needs and lets the caller decide
   what to write from what the store holds, in the same transaction. An id
   that is gone or holds another record is not written, never recreated,
   and a person's change that was not made is said.

   S9 IS NOT HERE. It was reproduced (the pull's branch 2 takes the record
   at the id a row's name, layer and status spell, and "cap" on top_hats and
   "cap_top" on hats are both t_cap_top_hats_wip), and its fix was built and
   calibrated. But landing it changes six existing expectations: three
   tests in tests/stage0marks.spec.js and three in tests/stage0stamps.spec.js
   make "a re-id of unsent work" out of exactly that collision, and with the
   fix the collision no longer re-ids anything. stage0marks is not this
   batch's to edit, so S9 waits for a ruling (followup-A-report.md).
   SUPERSEDED BY THE CONTROLLER'S RULING ON S9: S9 IS HERE (section 13).
   s0SameTrait: a record found by the id a row, a file or a project file's
   item spells is that trait only when its kind, name, layer and status are
   theirs. Asked by:
   - cloudPull's branch 2 (tests/pullidentitybyname.spec.js). Another
     trait's record is a clash, and the row arrives under a free name.
     Before this no pull gave one (the clash was reached only with the id
     free), and giving one exposed three more things, each measured with
     the same-trait test alone and fixed here: a record the clash renamed
     (cap-2) was taken for the group's own "cap-2" arriving later, and this
     device's unsent weight for it went to that row - a record whose own
     row the listing still has is that row's trait; a free name took the id
     another listed row spells, and that row was dropped for a pull - it
     skips those ids now; and a row whose id another row new here took was
     dropped for a pull, then, falling through, skipped as "changed here
     while loading" because the other's download touched the id its name
     spells - it falls through, and a download asks only the id it lands
     on. A row listed twice is taken once, as the drop used to take it.
   - bulkImport (tests/importidentitybyname.spec.js): a file whose id
     another trait holds - in the project, or written by this import - is
     not imported, and the note names both; its attempts plan leaves it
     out. Refused, not renamed: see there.
   - importProject: "already here" only for the same trait.
   The six tests that built "a re-id of unsent work" from this collision
   (stage0marks.spec.js, stage0stamps.spec.js) are superseded there, with
   the measurement that no other path makes one.

   S20 (tests/ownimportnotaclash.spec.js). A record with unsent work keeps
   rowAt where it was, so a send of this device's own that landed meanwhile
   - a folder import's replaces PATCH after its carried weight could not be
   sent, cloudPatchOne's PATCH while the person edited the trait - moved the
   row past rowAt, and the next pull called it a teammate's change: "you
   have unsaved changes to, kept", and a clash in the mail. s0StandsIn and
   cloudPatchOne record the version their own send produced, as s0Sent =
   {row, at}, on the record as it is (s0MarkSent, one transaction); the
   pull's two clash tests take a row carrying exactly that as this
   device's own. rowAt keeps its meaning, so a teammate's later change
   still counts. Beside it, measured on 91eb861 and not in the plan's list:
   a weight the group took, set live (setRarity, setRarityMany), was
   written back with the rowAt from before the PATCH, and the next pull
   said "1 changed in place by the group" and wrote it again. The write
   back now takes the answered row's updated_at, as cloudPatchOne's does.
   And s0StandsIn on a dropped connection: its fetch threw past its write,
   so the pairing its comment promises for "could not be told" was not
   kept (measured). A dropped connection is "could not be told" now.

   setRarity keeps its first read of the record as stored (patch593): it
   is where a press that changes nothing leaves with no write, and the wait
   tests/stage0moves.spec.js holds to move the page (a weight and its
   control). It decides no write any more; the write's own transaction
   reads the id again.

   S4 (tests/pullwritesonlywhatitplanned.spec.js). The touchedSince re-ask
   after the C3 wait is kept, and its comment superseded: the widened plan
   check sees a change that has landed, and the re-ask is what sees a write
   this tab has begun and not yet landed. The spec is that case, and it
   reddens without the re-ask.

   FIX ROUND 1 (the review of 3dd65bb; both older than stage 0, both
   measured on 91eb861's page and on 3dd65bb's, in
   tests/pullwritesonlywhatitplanned.spec.js).
   P1: cloudPull's download of a teammate's edit over this device's synced
   copy (branch 2, a new row with the trait's name, layer and status) was
   planned from that copy and written after the picture download, the
   longest wait in a pull, with no plan check. Another tab's unsent weight
   made during the download was written over and marked synced, and no
   clash was said. The write now goes through dbPut's was, the copy planned
   from; refused, it is counted as changed here while loading, and the next
   pull names the clash.
   F2: the same branch, finding the copy with unsent work, counts a clash and
   says "kept" - and its merge took the row's rarity and shelf_order over
   the unsent ones. A record with unsent work now keeps its own weight and
   order, and takes only the row's id and path (which the next Save to cloud
   addresses).

   Anchored on exact lines of 91eb861's page (after 600-607), each found
   exactly once; checked first and written last; page-integrity must find
   nothing new. No new indexedDB.open or deleteDatabase. */
'use strict';
const s0 = require('./stage0-common.cjs');
const L = (s) => s.split('\n');
const doc = s0.start([
  ['function s0ReidTx(d,oldId,rec,was,by){', 'patch601 (fix round 5) is not applied: s0ReidTx'],
  ['async function s0StandsIn(old,newId,home){', 'patch603 is not applied: s0StandsIn'],
  ['function s0HomeNow(){', 'patch602 (fix round 4) is not applied: s0HomeNow'],
]);

/* ---- 1. dbPut: an optional compare-and-set (S5) ---------------------------- */
doc.swap(L(String.raw`async function dbPut(rec,wk,uid){ touch(rec&&rec.id); const d=await db(); return new Promise((res,rej)=>{
  const t=d.transaction(STORE,'readwrite'), s=t.objectStore(STORE);
  /* A person's draft needs nothing from what it replaces: stamped as it goes. */
  if(s0Stamps(rec)&&rec.kind==="autosave"&&wk!=="pull") s.put(s0Stamp(rec,null,wk,uid));
  else if(s0Stamps(rec)){ const q=s.get(rec.id); q.onsuccess=()=>{ s.put(s0Stamp(rec,q.result,wk,uid)); }; }
  else s.put(rec);
  t.oncomplete=()=>res(); t.onerror=()=>rej(t.error); t.onabort=()=>rej(dbAborted(t)); }); }`), L(String.raw`/* FOLLOW-UP A (patch608, S5): WAS, WHEN GIVEN, IS THE RECORD THE CALLER
   READ. The id is read in this same transaction, and the record is put only
   if the store still holds exactly that (s0SameAsPlanned); otherwise nothing
   is written. Answers whether it put - true, as before, when no was is
   given. For a record put under its own id after a wait; a write that has to
   decide what to write from what is stored uses s0WriteIfTx. */
async function dbPut(rec,wk,uid,was){ touch(rec&&rec.id); const d=await db(); return new Promise((res,rej)=>{
  const t=d.transaction(STORE,'readwrite'), s=t.objectStore(STORE);
  let put=true;
  if(was!==undefined){ put=false; const q=s.get(rec.id); q.onsuccess=()=>{ if(!s0SameAsPlanned(q.result,was)) return; put=true; s.put(s0Stamps(rec)?s0Stamp(rec,q.result,wk,uid):rec); }; }
  /* A person's draft needs nothing from what it replaces: stamped as it goes. */
  else if(s0Stamps(rec)&&rec.kind==="autosave"&&wk!=="pull") s.put(s0Stamp(rec,null,wk,uid));
  else if(s0Stamps(rec)){ const q=s.get(rec.id); q.onsuccess=()=>{ s.put(s0Stamp(rec,q.result,wk,uid)); }; }
  else s.put(rec);
  t.oncomplete=()=>res(put); t.onerror=()=>rej(t.error); t.onabort=()=>rej(dbAborted(t)); }); }`));

/* ---- 2. s0SameAsPlanned: every stored field (S3, I7) ----------------------- */
doc.swap(L(String.raw`function s0SameAsPlanned(cur,was){
  return !!cur && !!was && sameRepair(cur,was) && (cur.at||0)===(was.at||0);
}`), L(String.raw`/* SUPERSEDED BY FOLLOW-UP A (patch608, S3 and I7): EVERY FIELD THE STORE
   HOLDS. sameRepair's list is what a merge from the server can change, and
   another tab changes more than that: its folder import writes s0Replaces
   (s0StandsIn, when the server could not be told), and the re-id wrote the
   plan's copy - without it - over the pairing (measured on 91eb861). The
   same held for every field the list did not name: the stamps (by, wk), the
   local id, w and h, the unsent word, s0Sent. So every field either record
   holds is compared, absent and null alike (as sameRepair reads them), a
   value that is an object (s0Sent) by its JSON. THE PICTURE BY SIZE AND
   TYPE, NEVER BY OBJECT: every read of the store gives a new Blob, so two
   reads of one unchanged record never hold the same object, and comparing
   them by identity would refuse every re-id. Its bytes are not read - a
   transaction's handler cannot wait for them - and every write of new
   pixels also moves at. No field is left out. Also the plan check of
   dbPut's was and of the write backs (patch608). */
function s0SameAsPlanned(cur,was){
  if(!cur||!was) return false;
  const v=x=>(x===undefined?null:x);
  for(const k of new Set(Object.keys(cur).concat(Object.keys(was)))){
    if(k==="blob"){ if(!s0SamePicture(cur.blob,was.blob)) return false; continue; }
    const a=v(cur[k]), b=v(was[k]);
    if(a===b) continue;
    if(a===null||b===null||typeof a!=="object"||typeof b!=="object") return false;
    if(JSON.stringify(a)!==JSON.stringify(b)) return false;
  }
  return true;
}
function s0SamePicture(a,b){
  const isBlob=x=>typeof Blob==="function"&&x instanceof Blob;
  if(isBlob(a)||isBlob(b)) return isBlob(a)&&isBlob(b)&&a.size===b.size&&a.type===b.type;
  return (a===undefined?null:a)===(b===undefined?null:b);
}`));

/* ---- 3. s0WriteIfTx, beside s0ReidTx (S7) ----------------------------------- */
doc.swap('let shelfMoveBusy=false;', L(String.raw`/* FOLLOW-UP A (patch608, S7): A WRITE LANDS ONLY ON THE RECORD IT READ.
   ONE readwrite transaction on STORE: every id in ids is read, and then
   decide(got) - got is a Map from each id (a string) to what the store holds
   under it now, or null - answers what to write, from that: null for
   nothing, or {del:[ids], put:[records], uid}. It is applied as
   dbApplyShelfRecords applies a plan: the deletes first, then each put
   stamped over what the store holds after them (s0Stamp, with wk, and uid
   when decide gives one - else whoever is signed in). d is a connection the
   caller holds and has asked, with no wait since, whether it is still home
   (s0AtHome); the transaction is created here synchronously. Only what it
   writes is touched, and told to d's own store. Answers decide's answer
   when it wrote, else null. A fifth write path beside dbPut,
   dbApplyShelfRecords, draftsFollow and s0ReidTx, for the writes that put a
   record back after a wait: a read and a write in two transactions put a
   record back under an id another tab had moved it from - two records for
   one row - or wrote over another tab's change (measured on 91eb861:
   setRarity, setRarityMany, commitShelfMove's rollback). */
const S0_NOT_THERE="Not changed: this trait was moved or removed since the page showed it. Find it on the shelf and try again.";
function s0NotThere(n){ return n+" trait"+(n===1?" was":"s were")+" not changed: "+(n===1?"it was":"they were")+" moved or removed since the page showed "+(n===1?"it":"them"); }
/* The record a card showed, still under its id: the same kind, and not
   another record's local id (a trait moved away and another made there). */
function s0SameRecord(stored,card){
  return !!stored&&!!card&&stored.kind===card.kind&&!(stored.lid&&card.lid&&stored.lid!==card.lid);
}
function s0WriteIfTx(d,ids,decide,wk){
  return new Promise((res,rej)=>{
    const t=d.transaction(STORE,"readwrite"), s=t.objectStore(STORE);
    const want=[...new Set((ids||[]).filter(x=>x!=null).map(String))], got=new Map();
    let plan=null, left=want.length;
    const apply=()=>{
      let p=null;
      try{ p=decide(got); }catch(e){ try{ t.abort(); }catch(_){ } rej(e); return; }
      if(!p) return;
      const del=[...new Set((p.del||[]).filter(x=>x!=null).map(String))], put=(p.put||[]).filter(Boolean);
      if(!del.length&&!put.length) return;
      plan=p;
      for(const id of del){ touchedAt.set(id,++touchSeq); s.delete(id); }
      for(const r of put){
        touchedAt.set(String(r.id),++touchSeq);
        if(s0Stamps(r)){ const q=s.get(r.id); q.onsuccess=()=>{ s.put(s0Stamp(r,q.result,wk,p.uid)); }; }
        else s.put(r);
      }
      tabStores.add(d.name); tabsTell();
    };
    for(const id of want){ const q=s.get(id); q.onsuccess=()=>{ got.set(id,q.result||null); if(--left===0) apply(); }; }
    if(!left) apply();
    t.oncomplete=()=>res(plan); t.onerror=()=>rej(t.error); t.onabort=()=>rej(dbAborted(t));
  });
}

let shelfMoveBusy=false;`));

/* ---- 4. commitShelfMove: what it wrote, kept; the rollback (S7) ------------- */
doc.swap(L(String.raw`  const originals=plan.updates.map(update=>items.find(item=>shelfCore.recordKey(item)===update.oldKey))
    .filter(Boolean);
  const state=currentShelfVisibility();`), L(String.raw`  const originals=plan.updates.map(update=>items.find(item=>shelfCore.recordKey(item)===update.oldKey))
    .filter(Boolean);
  const state=currentShelfVisibility();
  /* FOLLOW-UP A (patch608, S7): the records as written - stamped in place by
     the write below - so the rollback can ask whether each is still what
     the store holds. */
  const s0Written=plan.updates.map(update=>(activeWs&&!update.record.synced)?update.record:unsentOf(update.record));`));
doc.swap('      plan.updates.map(update=>(activeWs&&!update.record.synced)?update.record:unsentOf(update.record)));', '      s0Written);');
doc.swap(L(String.raw`    try{
      await dbApplyShelfRecords(plan.updates.map(update=>update.record.id),originals);
      /* STAGE 0 (FINAL FIXES, B1): AND THE DRAWING WITH THEM. draftsFollow
         moved it to the new id before the send; put back without it, it
         stayed under an id no trait has, and opening the trait offered
         nothing - on a held send, a refusal, a server error or no
         connection alike (measured by the final review; older than stage
         0 for a failed send). */
      try{ await draftsFollow(plan.updates.map(u=>({from:u.record.id, to:u.oldId})),s0Home); }catch(_){}
      for(const update of plan.updates) state.transfer(shelfCore.recordKey(update.record),update.oldKey);
      await renderShelf();
    }catch(_){}

    toast(shared.reason==='duplicate'
      ? 'Move cancelled because the shared shelf changed'
      : shared.reason==='held' ? S0_REFUSED   /* final fixes, B3: put back, so not done */
      : 'Move did not sync, so the old order was restored');
    return false;`), L(String.raw`    /* FOLLOW-UP A (patch608, S7): PUT BACK ONLY WHAT IS STILL THIS MOVE'S.
       The send is a wait, and another tab can change a moved record during
       it - approve it (a new id), reweight it, remove it. Putting the
       originals back regardless recreated the id it had left (two records
       for one row) or wrote the old weight over the new one (measured on
       91eb861). Now each update is read in the rollback's own transaction
       (s0WriteIfTx): put back only while its new id still holds what this
       move wrote (or markUnsent's copy of it, which cloudSaveShelfPlan
       writes on a failed send) and its old id is free. The rest are left as
       they are now, still marked unsent, and the toast says how many. */
    const s0Back=[], s0Kept=[];
    try{
      const d=await db();
      if(!s0AtHome(s0Home)){ toast(S0_LEFT); return false; }
      const s0Ids=[];
      for(const u of plan.updates){ s0Ids.push(u.record.id); if(u.oldId!==u.record.id) s0Ids.push(u.oldId); }
      await s0WriteIfTx(d,s0Ids,(got)=>{
        const del=[], put=[];
        plan.updates.forEach((u,i)=>{
          const now=got.get(String(u.record.id));
          const mine=s0SameAsPlanned(now,s0Written[i])||s0SameAsPlanned(now,unsentOf(s0Written[i]));
          const free=u.oldId===u.record.id||!got.get(String(u.oldId));
          const orig=originals.find(o=>shelfCore.recordKey(o)===u.oldKey);
          if(!mine||!free||!orig){ s0Kept.push(u); return; }
          del.push(u.record.id); put.push(orig); s0Back.push(u);
        });
        return {del:del, put:put};
      });
      /* STAGE 0 (FINAL FIXES, B1): AND THE DRAWING WITH THEM. draftsFollow
         moved it to the new id before the send; put back without it, it
         stayed under an id no trait has, and opening the trait offered
         nothing - on a held send, a refusal, a server error or no
         connection alike (measured by the final review; older than stage
         0 for a failed send). */
      try{ await draftsFollow(s0Back.map(u=>({from:u.record.id, to:u.oldId})),s0Home); }catch(_){}
      for(const update of s0Back) state.transfer(shelfCore.recordKey(update.record),update.oldKey);
      await renderShelf();
    }catch(_){}

    const s0Said=shared.reason==='duplicate'
      ? 'Move cancelled because the shared shelf changed'
      : shared.reason==='held' ? S0_REFUSED   /* final fixes, B3: put back, so not done */
      : (s0Back.length||!s0Kept.length) ? 'Move did not sync, so the old order was restored' : 'Move did not sync';
    const s0N=s0Kept.length;
    toast(s0N ? s0Said+(/[.!]$/.test(s0Said)?' ':'. ')+s0N+' trait'+(s0N===1?' was':'s were')+' changed since the move and '
      +(s0N===1?'is':'are')+' left as '+(s0N===1?'it is':'they are')+' now' : s0Said);
    return false;`));

/* ---- 5. cloudRarity: the version the PATCH produced (beside S20) ------------ */
doc.swap('async function cloudRarity(rec,home){', 'async function cloudRarity(rec,home,got){');
doc.swap(L(String.raw`      let rows=null; try{ rows=await r.json(); }catch(_){ rows=null; }
      return (Array.isArray(rows)&&rows.length===0) ? "unreachable" : "ok";`), L(String.raw`      let rows=null; try{ rows=await r.json(); }catch(_){ rows=null; }
      /* FOLLOW-UP A (patch608): the version of the row this PATCH produced
         (its updated_at, which the PATCH moved), for the caller's write back
         - read only when exactly this row answered. */
      if(got&&Array.isArray(rows)&&rows.length===1&&rows[0]&&rows[0].id===rec.rowId) got.at=rows[0].updated_at||null;
      return (Array.isArray(rows)&&rows.length===0) ? "unreachable" : "ok";`));

/* ---- 6. cloudPatchOne (S20, S7) --------------------------------------------- */
doc.swap(L(String.raw`    if(rec.id && touchedSince(rec.id,readAt)) return true;
    if(!s0AtHome(s0Home)) return true;   /* STAGE 0 (8b): moved during the send */
    const up=Object.assign({},rec,{synced:true, rowAt:rows[0].updated_at||rec.rowAt||null}); delete up.unsent;
    try{ await dbPut(up,"sent"); }catch(_){}`), L(String.raw`    /* FOLLOW-UP A (patch608, S20): and the version this send produced is
       recorded on the edited record, which keeps its rowAt (its unsent work
       is based on the row as it was then): the next pull reads that version
       as this device's own, not a teammate's change under unsent work
       (s0MarkSent; measured on 91eb861, a clash in the mail). */
    if(rec.id && touchedSince(rec.id,readAt)){
      const s0At=rows[0].updated_at||null;
      if(s0At){ try{ await s0MarkSent(rec.id,rec.rowId,s0At,s0Home); }catch(_){} }
      return true;
    }
    if(!s0AtHome(s0Home)) return true;   /* STAGE 0 (8b): moved during the send */
    const up=Object.assign({},rec,{synced:true, rowAt:rows[0].updated_at||rec.rowAt||null}); delete up.unsent;
    /* FOLLOW-UP A (patch608, S7): only over the record this send was for -
       another tab can move or change it during the PATCH, and this put the
       old id back (measured on 91eb861). Not written, the record stays
       unsent, and the next Save to cloud patches it again. */
    try{ await dbPut(up,"sent",undefined,rec); }catch(_){}`));

/* ---- 7. setRarity (S7, and the write back's rowAt) -------------------------- */
doc.swap(L(String.raw`  { let s=null; try{ s=await dbGet(rec.id); }catch(_){ s=null; } if(s&&s.kind===rec.kind) rec=s; }
  const cur = typeof rec.rarity==="number" ? rec.rarity : RAR_UNSET;
  if(cur===v) return false;
  const next={...rec, rarity:v};
  /* STAGE 0 (8b in patch602): a synced weight is written marked unsent, and
     the mark cleared once the group took it. The read of the record above
     waited: left since, nothing is written (fix round 4). */
  const s0Ahead=!!(next.rowId&&next.synced);
  const s0Want=s0Ahead ? {...next, synced:false, unsent:"meta"} : next;
  if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return false; }
  await dbPut(s0Want);
  const s0Seq=touchSeq;
  const sent=await cloudRarity(next,s0Home);`), L(String.raw`  /* FOLLOW-UP A (patch608, S7): the card's copy stands in only for the same
     record - not another record's local id made under the id since. The
     read decides no write any more (below); it is the record as stored for
     a press that changes nothing, which leaves with no write. */
  { let s=null; try{ s=await dbGet(rec.id); }catch(_){ s=null; } if(s&&s0SameRecord(s,rec)) rec=s; }
  if((typeof rec.rarity==="number" ? rec.rarity : RAR_UNSET)===v) return false;
  /* STAGE 0 (8b in patch602): a synced weight is written marked unsent, and
     the mark cleared once the group took it. The read of the record above
     waited: left since, nothing is written (fix round 4). */
  /* FOLLOW-UP A (patch608, S7): READ AND WRITTEN IN ONE TRANSACTION. The read
     above (dbGet) and the write (dbPut) were two, and the card's copy was
     written when the id was empty: a card drawn before another tab moved
     the trait - or a move landing between the two - put the trait back
     under the id it had left, and the PATCH went too (two records for one
     row, measured on 91eb861). Now s0WriteIfTx reads the id again and
     writes in one transaction on this page's connection, asked s0AtHome
     with no wait between (fix round 4's check, moved here). An id that is
     gone, or holds another record, is not written and nothing is sent;
     that is said. The record as stored is what is written and sent
     (patch593). */
  const s0d=await db();
  if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return false; }
  let next=null, s0Ahead=false, s0Want=null, s0Gone=false;
  await s0WriteIfTx(s0d,[rec.id],(got)=>{
    const s=got.get(String(rec.id));
    if(!s0SameRecord(s,rec)){ s0Gone=true; return null; }
    const cur = typeof s.rarity==="number" ? s.rarity : RAR_UNSET;
    if(cur===v) return null;
    next={...s, rarity:v};
    s0Ahead=!!(next.rowId&&next.synced);
    s0Want=s0Ahead ? {...next, synced:false, unsent:"meta"} : next;
    return {put:[s0Want]};
  });
  if(s0Gone){ toast(S0_NOT_THERE); return false; }
  if(!next) return false;
  const s0Seq=touchSeq;
  const s0Got={};
  const sent=await cloudRarity(next,s0Home,s0Got);`));
doc.swap('    if(s0AtHome(s0Home)){ if(!touchedSince(next.id,s0Seq)) await dbPut(next); }', L(String.raw`    /* FOLLOW-UP A (patch608, S7): written back only over what was written
       ahead - another tab can move or change the record during the PATCH,
       and this put the old id back (measured on 91eb861). And with the
       version the PATCH produced as rowAt, as cloudPatchOne's write does:
       left at the version before, the next pull said "1 changed in place by
       the group" of this device's own weight, and wrote it again (measured
       on 91eb861). */
    if(s0AtHome(s0Home)){ if(!touchedSince(next.id,s0Seq)) await dbPut(s0Got.at ? {...next, rowAt:s0Got.at} : next,undefined,undefined,s0Want); }`));

/* ---- 8. setRarityMany (S7, and the write back's rowAt) ---------------------- */
doc.swap('async function setRarityMany(recs,w,home){', L(String.raw`/* said (FOLLOW-UP A, patch608): when given, the count of traits that were
   not changed because they had moved or gone is left in said.notThere for
   the caller's own toast; without it, this says so itself. */
async function setRarityMany(recs,w,home,said){`));
doc.swap(L(String.raw`  const changed=(recs||[]).filter(r=>r && (typeof r.rarity==="number" ? r.rarity : RAR_UNSET)!==v)
    .map(r=>Object.assign({},r,{rarity:v}));
  if(!changed.length) return 0;
  /* STAGE 0 (8b in patch602): a synced row is written marked unsent, and the
     mark cleared below for each row the group took. Home is noted here,
     before this function's first wait (fix round 4). */
  const s0Home=home||s0HomeNow();
  if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return 0; }
  await dbApplyShelfRecords([],changed.map(r=>(r.rowId&&r.synced) ? Object.assign({},r,{synced:false, unsent:"meta"}) : r));
  const s0Seq=touchSeq;`), L(String.raw`  const s0Asked=(recs||[]).filter(r=>r && (typeof r.rarity==="number" ? r.rarity : RAR_UNSET)!==v);
  if(!s0Asked.length) return 0;
  /* STAGE 0 (8b in patch602): a synced row is written marked unsent, and the
     mark cleared below for each row the group took. Home is noted here,
     before this function's first wait (fix round 4). */
  const s0Home=home||s0HomeNow();
  /* FOLLOW-UP A (patch608, S7): READ AND WRITTEN IN ONE TRANSACTION, as
     setRarity's write ahead is. This wrote the caller's copies - read when
     the plan was drawn - so a trait another tab had moved since was put
     back under its old id, and the PATCH went too (measured on 91eb861).
     Now each id is read in the write's own transaction (s0WriteIfTx): one
     that is gone or holds another record is not written or sent, and is
     counted and said; the rest are the records as stored, reweighted. */
  const s0d=await db();
  if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return 0; }
  const changed=[], s0Ahead=new Map(), s0AnsweredAt=new Map();
  let s0Gone=0;
  await s0WriteIfTx(s0d,s0Asked.map(r=>r.id),(got)=>{
    const put=[], seen=new Set();
    for(const r of s0Asked){
      if(seen.has(String(r.id))) continue;
      seen.add(String(r.id));
      const s=got.get(String(r.id));
      if(!s0SameRecord(s,r)){ s0Gone++; continue; }
      if((typeof s.rarity==="number" ? s.rarity : RAR_UNSET)===v) continue;
      const next=Object.assign({},s,{rarity:v});
      const ahead=(next.rowId&&next.synced) ? Object.assign({},next,{synced:false, unsent:"meta"}) : next;
      changed.push(next); s0Ahead.set(next,ahead); put.push(ahead);
    }
    return {put:put};
  });
  if(s0Gone){ if(said) said.notThere=s0Gone; else toast(s0NotThere(s0Gone)); }
  if(!changed.length) return 0;
  const s0Seq=touchSeq;`));
doc.swap('      const answered=new Set((Array.isArray(got)?got:[]).map(x=>x&&x.id));', L(String.raw`      const answered=new Set((Array.isArray(got)?got:[]).map(x=>x&&x.id));
      for(const x of (Array.isArray(got)?got:[])) if(x&&x.id) s0AnsweredAt.set(x.id,x.updated_at||null);   /* FOLLOW-UP A (patch608): for the write back's rowAt */`));
doc.swap(L(String.raw`  if(s0Landed.length){
    if(s0AtHome(s0Home)){ const s0Here=s0Landed.filter(r=>!touchedSince(r.id,s0Seq)); if(s0Here.length) await dbApplyShelfRecords([],s0Here); }
    else await s0ClearAhead(s0Home,s0Landed.map(r=>Object.assign({},r,{synced:false, unsent:"meta"})));
  }`), L(String.raw`  /* FOLLOW-UP A (patch608, S7): the write back only over what was written
     ahead, read in its own transaction - another tab can move or change a
     record during the PATCH, and this put the old id back (measured on
     91eb861) - and with the version the PATCH produced as rowAt, as
     setRarity's is (the next pull said "changed in place by the group" of
     these weights, measured). */
  if(s0Landed.length){
    let s0d2=null;
    if(s0AtHome(s0Home)){ try{ s0d2=await db(); }catch(_){ s0d2=null; } }
    if(s0AtHome(s0Home)){
      const s0Here=s0Landed.filter(r=>!touchedSince(r.id,s0Seq));
      if(s0Here.length&&s0d2) await s0WriteIfTx(s0d2,s0Here.map(r=>r.id),(got)=>{
        const put=[];
        for(const r of s0Here){
          if(!s0SameAsPlanned(got.get(String(r.id)),s0Ahead.get(r))) continue;
          const at=s0AnsweredAt.get(r.rowId);
          put.push(at ? Object.assign({},r,{rowAt:at}) : r);
        }
        return {put:put};
      });
    }
    else await s0ClearAhead(s0Home,s0Landed.map(r=>Object.assign({},r,{synced:false, unsent:"meta"})));
  }`));

/* ---- 9. setRarityMany's callers say what was not changed (S7) ---------------- */
doc.swap(L(String.raw`        also=await setRarityMany(g.rows.filter(r=>r.id!==t.id && !rarityPlanned(r)),RAR_NORMAL,s0Home);
        await setRarity(t,nw,s0Home);
        await afterRarity();
        if(also) toast("Planned the other "+also+" in "+g.layer+" at normal,"
          +" so this set has room to make one rare. Nothing else changed.");`), L(String.raw`        const s0Said={};   /* FOLLOW-UP A (patch608): what setRarityMany could not change, said here */
        also=await setRarityMany(g.rows.filter(r=>r.id!==t.id && !rarityPlanned(r)),RAR_NORMAL,s0Home,s0Said);
        await setRarity(t,nw,s0Home);
        await afterRarity();
        if(also) toast("Planned the other "+also+" in "+g.layer+" at normal,"
          +" so this set has room to make one rare. Nothing else changed."
          +(s0Said.notThere ? " "+s0NotThere(s0Said.notThere)+"." : ""));
        else if(s0Said.notThere) toast(s0NotThere(s0Said.notThere));`));
doc.swap(L(String.raw`  done=await setRarityMany(want,RAR_NORMAL,home);
  await afterRarity();
  toast("Set "+done+" trait"+(done===1?"":"s")+" to normal."
    +" Nothing about the collection changed.");`), L(String.raw`  const s0Said={};   /* FOLLOW-UP A (patch608): what setRarityMany could not change, said here */
  done=await setRarityMany(want,RAR_NORMAL,home,s0Said);
  await afterRarity();
  toast("Set "+done+" trait"+(done===1?"":"s")+" to normal."
    +" Nothing about the collection changed."
    +(s0Said.notThere ? " "+s0NotThere(s0Said.notThere)+"." : ""));`));

/* ---- 10. s0StandsIn and s0MarkSent (S20) ------------------------------------ */
doc.swap('async function s0StandsIn(old,newId,home){', L(String.raw`/* FOLLOW-UP A (patch608, S20): THIS DEVICE'S OWN SEND, ON A RECORD THAT
   KEEPS UNSENT WORK. Such a record keeps rowAt at the version its unsent
   work is based on, so the row's newer updated_at after a send of this
   device's own read, at the next pull, as a teammate's change under that
   work - "you have unsaved changes to, kept", and a clash in the mail
   (measured on 91eb861: a folder import whose carried weight could not be
   sent, then told its replaces; and cloudPatchOne while the person edited
   the trait). s0Sent = {row, at} is the version the send produced; the
   pull's clash tests take a row carrying exactly that as this device's own
   (s0OwnSend), and rowAt keeps its meaning, so a teammate's later change
   still counts. Written in one transaction (s0WriteIfTx) on the record as it
   is now, only while it still holds that row and still has unsent work,
   and as its owner's; into home's store only (asked with no wait before the
   transaction is made). A new record field for plan 2's interface list. */
async function s0MarkSent(id,row,at,home,gen){
  if(!id||!row||!at) return false;
  const d=await db();
  if(!s0AtHome(home)||(gen!==undefined&&!wsStill(gen))) return false;
  const done=await s0WriteIfTx(d,[id],(got)=>{
    const s=got.get(String(id));
    if(!s||s.synced||s.rowId!==row) return null;
    return {put:[Object.assign({},s,{s0Sent:{row:row, at:at}})], uid:(s.by===undefined?null:s.by)};
  });
  return !!done;
}
async function s0StandsIn(old,newId,home){`));
doc.swap(L(String.raw`        const r=await fetch(SB_URL+"/rest/v1/traits?id=eq."+encodeURIComponent(rec.rowId),
          {method:"PATCH", headers:Object.assign({Prefer:"return=representation"},h), body:JSON.stringify({replaces:was})});
        let rows=[];`), L(String.raw`        /* FOLLOW-UP A (patch608): a dropped connection is "could not be told",
           as a refusal is. The fetch threw past the write below, and the
           record kept no pairing (measured on 91eb861). */
        let r=null;
        try{ r=await fetch(SB_URL+"/rest/v1/traits?id=eq."+encodeURIComponent(rec.rowId),
          {method:"PATCH", headers:Object.assign({Prefer:"return=representation"},h), body:JSON.stringify({replaces:was})}); }catch(_){ r=null; }
        let rows=[];`));
doc.swap('      if(at&&cur&&cur.rowId===rec.rowId&&cur.synced){ try{ await dbPut(Object.assign({},cur,{rowAt:at}),"sent",cur.by===undefined?null:cur.by); }catch(_){} }',
  L(String.raw`      if(at&&cur&&cur.rowId===rec.rowId&&cur.synced){ try{ await dbPut(Object.assign({},cur,{rowAt:at}),"sent",cur.by===undefined?null:cur.by); }catch(_){} }
      /* FOLLOW-UP A (patch608, S20): holding unsent work, the record keeps its
         rowAt and learns that this version is this device's own (s0MarkSent). */
      else if(at&&cur&&cur.rowId===rec.rowId){ try{ await s0MarkSent(newId,rec.rowId,at,s0Home,gen); }catch(_){} }`));

/* ---- 11. cloudPull (S9, S20, S5, S4) ----------------------------------------- */
doc.swap('async function cloudPull(opts){', L(String.raw`/* FOLLOW-UP A (patch608, S20): the row is at exactly the version a send of
   this device's own produced (s0Sent, see s0MarkSent). */
function s0OwnSend(rec,row){
  return !!rec&&!!row&&!!rec.s0Sent&&rec.s0Sent.row===row.id&&!!row.updated_at&&rec.s0Sent.at===row.updated_at;
}
async function cloudPull(opts){`));
doc.swap('        if(!!theirs && (!ours || theirs>ours)) clashed.push(cur.name);', L(String.raw`        /* FOLLOW-UP A (patch608, S20): not when the row is at the version a
           send of this device's own produced - that is not somebody else's
           change under the unsent work (s0OwnSend). */
        if(!!theirs && (!ours || theirs>ours) && !s0OwnSend(cur,row)) clashed.push(cur.name);`));
doc.swap('      if(newer && !cur.synced){', L(String.raw`      /* FOLLOW-UP A (patch608, S20): as the clash test above; here only a row
         the record no longer holds reaches it, which no writer of s0Sent
         produces today (it is kept so the two tests read alike). */
      if(newer && !cur.synced && !s0OwnSend(cur,row)){`));
doc.swap(L(String.raw`        /* STAGE 0 (final adjudication touch): and asked again whether this
           tab changed the record, now that the loop's own ask is a wait old:
           a reweight during the wait for the save was written over. */
        if(touchedSince(rp.oldId,seqAt)){ skipped++; continue; }`), L(String.raw`        /* STAGE 0 (final adjudication touch): and asked again whether this
           tab changed the record, now that the loop's own ask is a wait old:
           a reweight during the wait for the save was written over. */
        /* FOLLOW-UP A (patch608, S4): since s0SameAsPlanned compares every
           stored field, a change this tab has LANDED during the wait is seen
           by the plan check as well, and this ask is a second line there.
           What only this ask sees is a write this tab has begun - touched -
           and not yet landed when the re-id's transaction is made: a status
           change started during the wait would land after the re-id, under
           the new status, and leave two records for one row. Kept for that
           (tests/pullwritesonlywhatitplanned.spec.js, S4, reddens without it). */
        if(touchedSince(rp.oldId,seqAt)){ skipped++; continue; }`));
doc.swap(L(String.raw`      /* STAGE 0 (adjudication C1): the uid taken with the ask at the top of
         the loop - nothing waits between them - not when the write lands. */
      await dbPut(rp.record,"pull",s0Uid());
      repaired++;`), L(String.raw`      /* STAGE 0 (adjudication C1): the uid taken with the ask at the top of
         the loop - nothing waits between them - not when the write lands. */
      /* FOLLOW-UP A (patch608, S5): AND ONLY OVER THE RECORD IT PLANNED FROM,
         as a re-id is. This write had no plan check: another tab's unsent
         weight was written over, and a trait another tab had moved was put
         back under its old id (measured on 91eb861). dbPut reads the id in
         its own transaction and puts only if it still holds rp.was;
         otherwise nothing is written, and the next pull decides again. */
      if((await dbPut(rp.record,"pull",s0Uid(),rp.was))===false){ skipped++; continue; }
      repaired++;`));

/* ---- 12. fix round 1: cloudPull's download over a copy, and branch 2's merge -- */
doc.swap(L(String.raw`        wanted.push({row:row, id:cur.id, name:cur.name, layer:layer, status:status, base:baseId,
          replaces:cur.id, incoming:true});`), L(String.raw`        /* FOLLOW-UP A (patch608, fix round 1, P1): and the copy it was
           planned from, for the download's plan check (below, at its write). */
        wanted.push({row:row, id:cur.id, name:cur.name, layer:layer, status:status, base:baseId,
          replaces:cur.id, incoming:true, was:cur});`));
doc.swap(L(String.raw`      repair.push({oldId:cur.id,record:shelfCore.mergeRemoteShelfRecord(cur,row,taken),was:cur,
        rowAt:(newer&&!cur.synced)?ours:theirs});`), L(String.raw`      /* FOLLOW-UP A (patch608, fix round 1, F2): A RECORD WITH UNSENT WORK
         KEEPS ITS WEIGHT AND ORDER. The merge takes the row's id and path, so
         the next Save to cloud addresses this row (cloudPatchOne's PATCH and
         cloudSyncOne's DELETE go by row id); that stays. It also took the
         row's rarity and shelf_order, over a record holding unsent work: the
         clash above was counted and said "kept", and the person's weight was
         gone - an unsent weight 5 became the row's 4, and a send of it gave
         the group 4 (measured on 91eb861 and on 3dd65bb). Now a record with
         unsent work keeps its own weight and order, as the held branch leaves
         such a record alone. Every record with unsent work, not only under a
         newer row: a row that is not newer (the page reads a missing
         updated_at as not newer) has nothing newer to give it either. */
      const s0Merged=shelfCore.mergeRemoteShelfRecord(cur,row,taken);
      if(!cur.synced) for(const k of ["rarity","shelfOrder"]){ if(cur[k]===undefined) delete s0Merged[k]; else s0Merged[k]=cur[k]; }
      repair.push({oldId:cur.id,record:s0Merged,was:cur,
        rowAt:(newer&&!cur.synced)?ours:theirs});`));
doc.swap('        await dbPut(rec,"pull",s0By); added++;', L(String.raw`        /* FOLLOW-UP A (patch608, fix round 1, P1): A DOWNLOAD OVER A COPY
           LANDS ONLY ON THE COPY IT WAS PLANNED FROM. It was planned from
           that copy and written after the download - the longest wait in a
           pull - asking only whether THIS tab had touched it (above): another
           tab's unsent weight made during the download was written over and
           marked synced, and no clash was said (measured on 91eb861 and on
           3dd65bb). dbPut reads the id in its own transaction and puts only
           while it still holds w.was, the copy planned from. Otherwise nothing
           is written, the drawing below (kept only for a copy replaced) is
           left as it is, and it is counted as changed here while loading; the
           next pull sees the unsent record and names the clash. A download
           to an id nobody held when the pull was planned has no was, and is
           written as before. */
        if((await dbPut(rec,"pull",s0By,w.replaces?w.was:undefined))===false){ skipped++; done++; say(); continue; }
        added++;`));

/* ---- 13. S9 (the controller's ruling): the same trait, by its parts ---------- */
doc.swap('/* FOLLOW-UP A (patch608, S20): the row is at exactly the version a send of', L(String.raw`/* FOLLOW-UP A (patch608, S9): THE SAME TRAIT, BY ITS PARTS. A trait is
   filed under the id its name, layer and status spell, t_<name>_<layer>_
   <status>, joined with "_" - which names and layers contain: "cap" on
   top_hats and "cap_top" on hats are both t_cap_top_hats_wip, and the store
   holds one record under it. A record found by that id is the trait a row,
   a file or a project file's item names only when its kind, name, layer and
   status are theirs (a reference: its kind and name, as its id is). Asked by
   cloudPull's branch 2, bulkImport and importProject, each of which took
   the record at the id for the trait (measured on 91eb861:
   tests/pullidentitybyname.spec.js, tests/importidentitybyname.spec.js). */
function s0SameTrait(rec,row){
  const kind=row&&row.kind==="ref" ? "ref" : "trait";
  if(!rec||!row||rec.kind!==kind||rec.name!==row.name) return false;
  if(kind==="ref") return true;
  return (rec.layer||"unsorted")===(row.layer||"unsorted") && (rec.status||"wip")===(row.status||"wip");
}
/* FOLLOW-UP A (patch608, S20): the row is at exactly the version a send of`));
/* cloudPull: what the listing itself says, before the loop. */
doc.swap('  const wanted=[], repair=[];', L(String.raw`  const wanted=[], repair=[];
  /* FOLLOW-UP A (patch608, S9): WHAT THIS LISTING SAYS, for the loop below.
     The rows it lists, by id: a record whose own row is still listed is
     that row's trait, not an earlier version of another row's. The id each
     row's own name, layer and status spell: a clash's free name is not
     taken from a row that arrives under its own. And the rows already
     looked at, so a row listed twice is taken once. */
  const s0Listed=new Set(rows.map(r=>r.id));
  const s0Own=new Set(rows.map(r=>r.kind==="ref"?("ref_"+r.name):("t_"+r.name+"_"+(r.layer||"unsorted")+"_"+(r.status||"wip"))));
  const s0RowSeen=new Set();`));
doc.swap('    if(goneMatch(goneList,row)) continue;', L(String.raw`    if(goneMatch(goneList,row)) continue;
    /* FOLLOW-UP A (patch608, S9): a row listed twice is taken once. It was
       taken once by the skip below, which a row of another trait reaches
       too; that one now arrives under a free name. */
    if(s0RowSeen.has(row.id)) continue;
    s0RowSeen.add(row.id);`));
/* cloudPull's branch 2: only the same trait. */
doc.swap(L(String.raw`      if(!cur){ continue; }
      const theirs=row.updated_at||null;
      const ours=cur.rowAt||null;`), L(String.raw`      /* FOLLOW-UP A (patch608, S9): ONLY THE SAME TRAIT. The id is not a key
         (s0SameTrait): a teammate's new "cap" on top_hats was downloaded over
         this device's "cap_top" on hats, or merged into it and moved to
         top_hats, and this device's own trait was gone from its layer
         (measured on 91eb861, tests/pullidentitybyname.spec.js, as the Task
         10 reviewer had). Another trait's record falls through to the clash
         below, which gives the row a free name.
         NOR ONE WHOSE OWN ROW IS STILL LISTED. A saved edit deletes the old
         row and inserts the new one, so a record holding a row this listing
         still has is that row's trait, whatever its name says. A clash's
         free name made it so: "cap" renamed to cap-2 here, and a teammate's
         own "cap-2" arriving later was taken for it - merged into it, and
         this device's unsent weight for the renamed trait was then sent to
         the teammate's row (measured with the same-trait test alone).
         AND NOT A SKIP WHEN NOTHING HOLDS THE ID. The id was handed out
         earlier in this pull, to a row of another trait (the same row twice
         is skipped above): "cap" on top_hats after "cap_top" on hats, both
         new here, was dropped until the next pull (measured). It falls
         through to the clash below. The body below is not re-indented, so
         the lines other patches name stay as they were. */
      if(cur && s0SameTrait(cur,row) && !(cur.rowId && cur.rowId!==row.id && s0Listed.has(cur.rowId))){
      const theirs=row.updated_at||null;
      const ours=cur.rowAt||null;`));
doc.swap(L(String.raw`      continue;
    }
    let name=row.name;`), L(String.raw`      continue;
      }
    }
    let name=row.name;`));
doc.swap('    while(taken.has(id)){ name=row.name+"-"+k;', L(String.raw`    /* FOLLOW-UP A (patch608, S9): nor an id another row of this listing
       spells for itself (s0Own): "cap" renamed to cap-2 took the id a
       teammate's own "cap-2" arrives under. */
    while(taken.has(id)||(id!==baseId&&s0Own.has(id))){ name=row.name+"-"+k;`));
doc.swap('        if(touchedSince(w.id,seqAt)||touchedSince(w.base,seqAt)){ skipped++; done++; say(); continue; }', L(String.raw`        /* FOLLOW-UP A (patch608, S9): THE ID IT LANDS ON, NOT THE ONE ITS NAME
           SPELLS. w.base differed from w.id only for a clash's free name, and
           before S9 no pull made one: the clash below branch 2 was reached
           only with its id free (every path in branch 2 continued). Now it
           is made, and its base is another trait's id - the one it would
           have replaced. That trait's own download in this same pull touched
           it, and the renamed row was skipped and said as "changed here while
           loading" (measured: "cap" on top_hats beside "cap_top" on hats,
           both new here, arrived one pull late). A touch of the base is
           about that other trait, not this row. For every other entry
           w.base is w.id, and the ask is unchanged. */
        if(touchedSince(w.id,seqAt)){ skipped++; done++; say(); continue; }`));
/* The re-id's comment: the collision it was written for no longer reaches it. */
doc.swap(L(String.raw`         Round 3 deleted first, and a stop after the delete lost unsent
         work: a re-id repair is not only of a synced copy, because ids
         collide across the name/layer boundary ("cap" on "top_hats" and
         "cap_top" on "hats" are both t_cap_top_hats_wip).`), L(String.raw`         Round 3 deleted first, and a stop after the delete lost unsent
         work: a re-id repair is not only of a synced copy, because ids
         collide across the name/layer boundary ("cap" on "top_hats" and
         "cap_top" on "hats" are both t_cap_top_hats_wip).
         SUPERSEDED BY FOLLOW-UP A (patch608, S9): THAT COLLISION NO LONGER
         REACHES A RE-ID. Branch 2 takes the record at a row's id only when it
         is the row's own trait by its parts (s0SameTrait), and the merge of
         the same trait keeps its id; the held branch leaves a record with
         unsent work alone. So a re-id is of a synced copy only - the plan
         check (s0SameAsPlanned) also refuses one whose record has changed
         since, synced flag included. Measured: an instrument reporting
         every re-id committed here found 6 of unsent work on the page
         before S9, all from the six stage-0 tests built on this collision
         (superseded there), and none on this page over 998 tests in 92
         spec files (26 re-ids, all of synced copies). The one transaction
         stays: a stop between separate writes left a synced copy under
         both ids too.`));
/* bulkImport: the attempts plan leaves out a file another trait's id refuses. */
doc.swap('      const plan=[], seen=new Set();', '      const plan=[], seen=new Set(), s0Planned=new Map();');
doc.swap(L(String.raw`        const tid="t_"+info.name+"_"+layer+"_"+status;
        const prev=seen.has(tid) ? null : (beforeById.get(tid)||null);
        seen.add(tid);`), L(String.raw`        const tid="t_"+info.name+"_"+layer+"_"+status;
        /* FOLLOW-UP A (patch608, S9): a file whose id another trait holds -
           one in the project, or one planned before it here - is not
           imported (the loop below), so it sends nothing. It carried that
           trait's row and local id into this plan. A file named from its
           picture is not planned here (above), so one of those taking an
           id first is seen by the loop only: this plan then names a send
           that never goes, which the proof never pairs (s0AttemptRun). */
        { const file={kind:"trait", name:info.name, layer:layer, status:status};
          const h=s0Planned.get(tid)||beforeById.get(tid)||null;
          if(h&&!s0SameTrait(h,file)) continue;
          s0Planned.set(tid,file); }
        const prev=seen.has(tid) ? null : (beforeById.get(tid)||null);
        seen.add(tid);`));
/* bulkImport's loop: refused, and said. */
doc.swap('  const writtenIds=new Set();', L(String.raw`  const writtenIds=new Set();
  /* FOLLOW-UP A (patch608, S9): the files not imported because another
     trait holds the id their path spells, each as "cap on top_hats would
     replace cap_top on hats". */
  const s0Refused=[];`));
doc.swap(L(String.raw`        const layer=info.layer||"unsorted";
        const status=info.status||"wip";
        if(!info.status) noStatus++;`), L(String.raw`        const layer=info.layer||"unsorted";
        const status=info.status||"wip";
        /* FOLLOW-UP A (patch608, S9): THE RECORD AT THE ID IS THIS FILE'S
           TRAIT ONLY WHEN IT IS THE SAME TRAIT BY ITS PARTS (s0SameTrait).
           Importing top_hats/wip/cap.png beside "cap_top" on hats replaced
           it: the record became "cap" on top_hats with the file's picture,
           keeping cap_top's weight, local id and row, and the page said
           "Imported 1 file" (measured on 91eb861; two such files in one
           folder did the same to each other, and in a group the file was
           sent under cap_top's row). The holder is the trait this import
           put there (supplied: written, or already here unchanged) or the
           one the project had. Another trait's id refuses the file, and the
           note names both. Not renamed as a pull's clash is - a pull cannot
           refuse a teammate's row, an import can refuse a file: a renamed
           file would not find its trait on the next import of the folder,
           which looks for it by the id its path spells, and would arrive
           again under the next free name each time. Before the counts
           below, which describe what was imported. */
        { const s0Tid="t_"+info.name+"_"+layer+"_"+status;
          const s0H=supplied.find(s=>s.id===s0Tid)||beforeById.get(s0Tid)||null;
          if(s0H&&!s0SameTrait(Object.assign({kind:"trait"},s0H),{kind:"trait", name:info.name, layer:layer, status:status})){
            s0Refused.push(info.name+" on "+layer+" would replace "+s0H.name+" on "+(s0H.layer||"unsorted"));
            /* Named for you above, and not imported: not counted as named. */
            if(looksUnnamed(readPath(f.webkitRelativePath||f.name).name)) renamed--;
            continue;
          } }
        if(!info.status) noStatus++;`));
doc.swap('  if(strips) bits.push(strips+" palette strip"+(strips===1?"":"s")+" skipped");', L(String.raw`  if(strips) bits.push(strips+" palette strip"+(strips===1?"":"s")+" skipped");
  /* FOLLOW-UP A (patch608, S9): named, because the file is not here. */
  if(s0Refused.length) bits.push(s0Refused.length+" not imported: "+s0Refused.slice(0,3).join("; ")
    +(s0Refused.length>3?" and "+(s0Refused.length-3)+" more":"")
    +" - a trait is kept under its name, layer and status joined by _, and these spell the same; rename one of them");`));
doc.swap('    skipped:failed+oversized+strips};', '    skipped:failed+oversized+strips+s0Refused.length};   /* FOLLOW-UP A (patch608, S9): and the files refused */');
/* importProject: "already here" is the same trait. */
doc.swap('    if(taken.has(id) && byId.has(id) && byId.get(id).blob && await sameBytes(byId.get(id).blob,blob)){', L(String.raw`    /* FOLLOW-UP A (patch608, S9): AND THE SAME TRAIT BY ITS PARTS
       (s0SameTrait). An item "cap" on top_hats with the picture of this
       project's "cap_top" on hats - both t_cap_top_hats_wip - was taken as
       already here, and not restored anywhere (measured on 91eb861,
       tests/importidentitybyname.spec.js). Another trait's id is a
       namesake's, and the item is renamed below as one is. */
    if(taken.has(id) && byId.has(id) && s0SameTrait(byId.get(id),{kind:it.kind==="ref"?"ref":"trait", name:name, layer:layer, status:status})
       && byId.get(id).blob && await sameBytes(byId.get(id).blob,blob)){`));

/* ---- checks ------------------------------------------------------------------ */
doc.finish(({ text, code, must }) => {
  const NL = s0.NL;
  /* The code without its comments, and without the blank lines a stripped
     comment leaves, so a sequence of lines is found across one. */
  const cc = code.split(NL).filter(l => l.trim() !== '').join(NL);
  const count = (s) => cc.split(s).length - 1;
  const fn = (sig) => { const a = cc.indexOf(sig); if (a < 0) throw new Error('missing ' + sig); const b = cc.indexOf(NL + '}' + NL, a); if (b < 0) throw new Error(sig + ' does not close'); return cc.slice(a, b + 3); };
  /* dbPut's compare-and-set reads in its own transaction and answers whether it put. */
  must('async function dbPut(rec,wk,uid,was){', 'dbPut has no was');
  must('  if(was!==undefined){ put=false; const q=s.get(rec.id); q.onsuccess=()=>{ if(!s0SameAsPlanned(q.result,was)) return; put=true;', 'dbPut does not check was before it puts');
  must('  t.oncomplete=()=>res(put);', 'dbPut does not answer whether it put');
  /* s0SameAsPlanned: every field, the picture by size and type, not sameRepair's list. */
  const same = fn('function s0SameAsPlanned(cur,was){');
  if (same.indexOf('sameRepair') >= 0) throw new Error('s0SameAsPlanned still leans on sameRepair\'s list');
  if (same.indexOf('new Set(Object.keys(cur).concat(Object.keys(was)))') < 0) throw new Error('s0SameAsPlanned does not compare every field either record holds');
  must('return isBlob(a)&&isBlob(b)&&a.size===b.size&&a.type===b.type;', 'the picture is not compared by size and type');
  /* s0WriteIfTx decides inside its transaction and creates it synchronously. */
  const wtx = fn('function s0WriteIfTx(d,ids,decide,wk){');
  if (!/^function s0WriteIfTx\(d,ids,decide,wk\)\{\r?\n  return new Promise\(\(res,rej\)=>\{\r?\n    const t=d\.transaction\(STORE,"readwrite"\)/.test(wtx)) throw new Error('s0WriteIfTx does not create its transaction first, with no wait');
  if (wtx.indexOf('p=decide(got)') < 0 || wtx.indexOf('await') >= 0) throw new Error('s0WriteIfTx does not decide inside the transaction, or waits');
  /* commitShelfMove: the rollback reads before it puts back. */
  const csm = fn('async function commitShelfMove(spec,home){');
  if (csm.indexOf('dbApplyShelfRecords(plan.updates.map(update=>update.record.id),originals)') >= 0) throw new Error('the rollback still puts the originals back unread');
  if (csm.indexOf('const d=await db();' + NL + '      if(!s0AtHome(s0Home)){ toast(S0_LEFT); return false; }' + NL + '      const s0Ids=[];') < 0
    || csm.indexOf('await s0WriteIfTx(d,s0Ids,(got)=>{') < 0) throw new Error('the rollback is not one transaction asked home with no wait before it');
  if (csm.indexOf('const mine=s0SameAsPlanned(now,s0Written[i])||s0SameAsPlanned(now,unsentOf(s0Written[i]));') < 0
    || csm.indexOf('const free=u.oldId===u.record.id||!got.get(String(u.oldId));') < 0) throw new Error('the rollback does not ask whether each record is still this move\'s and its old id free');
  /* setRarity: no read outside the write's transaction; home asked with no wait before it. */
  const sr = fn('async function setRarity(rec,w,home){');
  /* Its first read decides no write: only the same record stands in for the card, and a press that changes nothing leaves. */
  if (sr.indexOf('if(s&&s0SameRecord(s,rec)) rec=s; }') < 0 || sr.indexOf('await dbPut(s0Want)') >= 0) throw new Error('setRarity\'s first read still decides its write');
  if (sr.indexOf('  const s0d=await db();' + NL + '  if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return false; }' + NL + '  let next=null, s0Ahead=false, s0Want=null, s0Gone=false;' + NL + '  await s0WriteIfTx(s0d,[rec.id],(got)=>{') < 0)
    throw new Error('setRarity\'s write ahead is not one transaction asked home with no wait before it');
  if (sr.indexOf('if(!s0SameRecord(s,rec)){ s0Gone=true; return null; }') < 0 || sr.indexOf('if(s0Gone){ toast(S0_NOT_THERE); return false; }') < 0) throw new Error('setRarity does not refuse and say a gone or other record');
  if (sr.indexOf(',undefined,undefined,s0Want); }') < 0) throw new Error('setRarity\'s write back does not check what was written ahead');
  if (sr.indexOf('await cloudRarity(next,s0Home,s0Got);') < 0 || sr.indexOf('{...next, rowAt:s0Got.at}') < 0) throw new Error('setRarity\'s write back does not take the PATCH\'s version');
  /* setRarityMany: both writes in their own reading transaction. */
  const srm = fn('async function setRarityMany(recs,w,home,said){');
  if (srm.indexOf('dbApplyShelfRecords(') >= 0) throw new Error('setRarityMany still writes unread');
  if (srm.indexOf('  const s0d=await db();' + NL + '  if(!s0AtHome(s0Home)){ toast(S0_LEFT_UNMADE); return 0; }') < 0) throw new Error('setRarityMany\'s first write is not asked home with no wait before it');
  if (srm.indexOf('if(!s0SameAsPlanned(got.get(String(r.id)),s0Ahead.get(r))) continue;') < 0) throw new Error('setRarityMany\'s write back does not check what was written ahead');
  if (count('setRarityMany(') !== 3 || count(',s0Said);') !== 2) throw new Error('setRarityMany\'s two callers do not hand it somewhere to say what was not changed');
  /* cloudPatchOne. */
  const cpo = fn('async function cloudPatchOne(rec,ctx,seq){');
  if (cpo.indexOf('try{ await dbPut(up,"sent",undefined,rec); }catch(_){}') < 0) throw new Error('cloudPatchOne\'s sent write does not check the record it sent');
  if (cpo.indexOf('if(s0At){ try{ await s0MarkSent(rec.id,rec.rowId,s0At,s0Home); }catch(_){} }') < 0) throw new Error('cloudPatchOne does not record its own version on an edited record');
  /* s0MarkSent: home asked with no wait before its transaction. */
  if (fn('async function s0MarkSent(id,row,at,home,gen){').indexOf('  const d=await db();' + NL + '  if(!s0AtHome(home)||(gen!==undefined&&!wsStill(gen))) return false;' + NL + '  const done=await s0WriteIfTx(d,[id],(got)=>{') < 0)
    throw new Error('s0MarkSent is not asked home with no wait before its transaction');
  const sti = fn('async function s0StandsIn(old,newId,home){');
  if (sti.indexOf('else if(at&&cur&&cur.rowId===rec.rowId){ try{ await s0MarkSent(newId,rec.rowId,at,s0Home,gen); }catch(_){} }') < 0) throw new Error('s0StandsIn does not record its own version on a record with unsent work');
  if (sti.indexOf('}catch(_){ r=null; }') < 0) throw new Error('s0StandsIn\'s PATCH still throws past its write on a dropped connection');
  /* cloudPull. */
  const cp = fn('async function cloudPull(opts){');
  if (count('!s0OwnSend(cur,row)') !== 2) throw new Error('the two clash tests do not both ask s0OwnSend');
  if (cp.indexOf('if((await dbPut(rp.record,"pull",s0Uid(),rp.was))===false){ skipped++; continue; }') < 0) throw new Error('the same-id repair write has no plan check');
  if (cp.indexOf('        if(touchedSince(rp.oldId,seqAt)){ skipped++; continue; }' + NL + '        const by=s0Uid();' + NL + '        const moved=await s0ReidTx(d,rp.oldId,rp.record,rp.was,by);') < 0) throw new Error('the re-ask after the C3 wait is not where it was');
  /* Fix round 1. P1: the download over a copy carries the copy it was planned
     from, and writes only over it; a refusal is counted and writes nothing
     after it. */
  if (cp.indexOf('replaces:cur.id, incoming:true, was:cur});') < 0) throw new Error('the download over a copy does not carry the copy it was planned from');
  if (cp.indexOf('        const s0By=s0Uid();' + NL + '        if((await dbPut(rec,"pull",s0By,w.replaces?w.was:undefined))===false){ skipped++; done++; say(); continue; }' + NL + '        added++;') < 0
    || cp.indexOf('await dbPut(rec,"pull",s0By); added++;') >= 0) throw new Error('the download over a copy has no plan check at its write');
  /* F2: branch 2's merge keeps a record's unsent weight and order. */
  if (cp.indexOf('      const s0Merged=shelfCore.mergeRemoteShelfRecord(cur,row,taken);' + NL
    + '      if(!cur.synced) for(const k of ["rarity","shelfOrder"]){ if(cur[k]===undefined) delete s0Merged[k]; else s0Merged[k]=cur[k]; }' + NL
    + '      repair.push({oldId:cur.id,record:s0Merged,was:cur,') < 0) throw new Error('branch 2\'s merge takes the row\'s weight and order over unsent work');
  /* S9: the same trait by its parts, asked by the pull's branch 2, the folder
     import (its plan and its loop) and a project file's "already here". */
  if (count('function s0SameTrait(rec,row){') !== 1) throw new Error('s0SameTrait is not defined exactly once');
  if (cp.indexOf('      const cur=byId.get(baseId);' + NL + '      if(cur && s0SameTrait(cur,row) && !(cur.rowId && cur.rowId!==row.id && s0Listed.has(cur.rowId))){' + NL + '      const theirs=row.updated_at||null;') < 0
    || cp.indexOf('        rowAt:(newer&&!cur.synced)?ours:theirs});' + NL + '      continue;' + NL + '      }' + NL + '    }' + NL + '    let name=row.name;') < 0
    || cp.indexOf('if(!cur){ continue; }') >= 0)
    throw new Error('branch 2 does not ask for the same trait, with its own row gone, before it decides, or does not fall through to the clash');
  if (cp.indexOf('    if(goneMatch(goneList,row)) continue;' + NL + '    if(s0RowSeen.has(row.id)) continue;' + NL + '    s0RowSeen.add(row.id);') < 0) throw new Error('a row listed twice is not taken once');
  if (cp.indexOf('    while(taken.has(id)||(id!==baseId&&s0Own.has(id))){ name=row.name+"-"+k;') < 0) throw new Error('a clash\'s free name can take an id another listed row spells for itself');
  if (cp.indexOf('touchedSince(w.base,seqAt)') >= 0 || cp.indexOf('        if(touchedSince(w.id,seqAt)){ skipped++; done++; say(); continue; }' + NL + '        const s0By=s0Uid();') < 0) throw new Error('a renamed download still asks about the id its name spells');
  const bi = fn('async function s0BulkImport(files,opts){');
  if (bi.indexOf('          const h=s0Planned.get(tid)||beforeById.get(tid)||null;' + NL + '          if(h&&!s0SameTrait(h,file)) continue;' + NL + '          s0Planned.set(tid,file); }' + NL + '        const prev=seen.has(tid) ? null : (beforeById.get(tid)||null);') < 0)
    throw new Error('the import\'s attempts plan does not leave out a file another trait\'s id refuses');
  if (bi.indexOf('        const status=info.status||"wip";' + NL + '        { const s0Tid="t_"+info.name+"_"+layer+"_"+status;' + NL
    + '          const s0H=supplied.find(s=>s.id===s0Tid)||beforeById.get(s0Tid)||null;' + NL
    + '          if(s0H&&!s0SameTrait(Object.assign({kind:"trait"},s0H),{kind:"trait", name:info.name, layer:layer, status:status})){') < 0)
    throw new Error('the import\'s loop does not refuse a file another trait\'s id holds, before it counts it');
  if (bi.indexOf('if(s0Refused.length) bits.push(') < 0 || bi.indexOf('skipped:failed+oversized+strips+s0Refused.length}') < 0) throw new Error('the import does not say, or count, the files it refused');
  if (fn('async function s0ImportProject(file){').indexOf('if(taken.has(id) && byId.has(id) && s0SameTrait(byId.get(id),{kind:it.kind==="ref"?"ref":"trait", name:name, layer:layer, status:status})') < 0)
    throw new Error('a project file\'s "already here" does not ask for the same trait');
  /* No new store opened or deleted (test/stage0-source.test.mjs counts them). */
  const opens = (code.match(/indexedDB\.open\(/g) || []).length, dels = (code.match(/deleteDatabase\(/g) || []).length;
  if (opens !== 3 || dels !== 1) throw new Error('indexedDB.open/deleteDatabase count moved: ' + opens + '/' + dels);
});
