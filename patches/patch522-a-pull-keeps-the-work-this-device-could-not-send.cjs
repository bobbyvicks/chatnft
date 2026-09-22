/* A PULL KEEPS THE WORK THIS DEVICE COULD NOT SEND.

   Reported 2026-09-21: "i refreshed and it didnt actually save it" - a skin
   added to the final project was back out of it after a reload.

   Adding to the final project moves the trait to a new record and uploads
   it as a new row. If that upload fails, setTraitStatus marks the record
   synced:false and keeps the rowId of the row it came from, because that is
   still the row a later Save to cloud has to replace - its comment says so.
   The page load that follows runs a quiet pull, and cloudPull matches the
   server's old row to that record by rowId and hands it to
   mergeRemoteShelfRecord, which takes the row's layer and status. So the
   stfp record was deleted and an approved one written in its place, and
   nothing said so. The other branch of the same loop has the rule already:
   "Taking theirs would destroy work this device never sent, which is the
   one thing pulling must not do." The row-id branch never asked.

   A row with this id can only differ from the record on the server's side
   through an in-place change - a rarity PATCH, a shelf move by RPC; a saved
   edit always deletes the row and inserts a new one, which arrives under a
   new id and through the other branch. So on a row-id match a record with
   unsent work is left alone. If the row is newer than the version this
   device last saw, somebody changed it in place underneath the unsent work:
   kept, and counted in the note as the other branch counts its clashes.

   And an upload now records which version of the row it made. cloudSyncOne
   wrote synced, rowId and path onto the record and left rowAt as whatever
   the record carried - for a status change, the OLD row's stamp - so the
   next pull read every upload as a newer row. Harmless while the record was
   synced; with the rule above it would have called every failed status
   change after an upload a clash with nobody. The insert answers with the
   row, and updated_at is in it. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const at = (line, label, range) => kit.only(L, l => l === line, label, range);
const swap = (line, to, label, range) => { const i = at(line, label, range); kit.replace(L, { start: i, end: i }, to); };

/* ---- 1. the row-id branch asks whether the record has unsent work -------- */
{
  const fn = kit.inFunction(L, 'async function cloudPull(opts){');
  swap('      const cur=held.get(row.id);', [
    '      const cur=held.get(row.id);',
    '      /* UNSENT WORK IS KEPT. A row with this id can only differ from the',
    '         record through an in-place change on the server - a saved edit',
    '         always arrives as a new row, through the branch below. So a record',
    '         with unsent work is left alone here, and if the row is newer than',
    '         the version this device last saw, somebody changed it in place',
    '         underneath that work: a clash, kept and counted like the ones',
    '         below. Measured before this: a status change whose upload failed',
    '         was reverted by the next page load, silently. */',
    '      if(!cur.synced){',
    '        const theirs=row.updated_at||null, ours=cur.rowAt||null;',
    '        if(!!theirs && (!ours || theirs>ours)) clashed.push(cur.name);',
    '        continue;',
    '      }',
  ], 'the row-id match', fn);
}

/* ---- 2. an upload records which version of the row it made -------------- */
{
  const fn = kit.inFunction(L, 'async function cloudSyncOne(rec,ctx,why){');
  const i = at('    let madeId=null;', 'madeId', fn);
  if (L[i + 1] !== '    if(r.ok){ try{ madeId=((await r.json())[0]||{}).id||null; }catch(_){ madeId=null; } }'
    || L[i + 2] !== '    if(r.ok && rec.id){ try{ await dbPut(Object.assign({},rec,'
    || L[i + 3] !== '      {synced:true, rowId:madeId, path:p})); }catch(_){} }') throw new Error('cloudSyncOne tail moved');
  kit.replace(L, { start: i, end: i + 3 }, [
    '    /* AND WHICH VERSION OF IT. rowAt is what the next pull measures "has',
    '       the server moved on" against; left as the record carried it, a',
    '       status change kept the OLD row\'s stamp and every upload read as a',
    '       newer row. The insert answers with the row it made. */',
    '    let madeId=null, madeAt=null;',
    '    if(r.ok){ try{ const made=(await r.json())[0]||{}; madeId=made.id||null; madeAt=made.updated_at||null; }',
    '      catch(_){ madeId=null; madeAt=null; } }',
    '    if(r.ok && rec.id){ try{ await dbPut(Object.assign({},rec,',
    '      {synced:true, rowId:madeId, path:p, rowAt:madeAt})); }catch(_){} }',
  ]);
}

/* ---- what has to be true afterwards ------------------------------------ */
const grew = kit.save(doc, ({ code }) => {
  const times = (s) => code.split(s).length - 1;
  const once = (s, n) => { if (times(s) !== (n || 1)) throw new Error('expected ' + (n || 1) + ' of: ' + s + ', got ' + times(s)); };
  once('      if(!cur.synced){');
  once('clashed.push(cur.name);', 2);
  once('rowAt:madeAt');
  once('mergeRemoteShelfRecord(cur,row,taken)', 2);
  /* The guard sits before the merge, inside the row-id branch. */
  const a = code.indexOf('const cur=held.get(row.id);');
  const g = code.indexOf('if(!cur.synced){', a);
  const m = code.indexOf('mergeRemoteShelfRecord(cur,row,taken)', a);
  if (!(a >= 0 && g > a && m > g && g - a < 200)) throw new Error('the guard is not where the row-id match is');
  /* The other branch is untouched: its clash still merges and names. */
  const b = code.indexOf('if(newer && !cur.synced){');
  if (b < 0 || code.indexOf('clashed.push(cur.name);', b) < 0) throw new Error('the name-match branch changed');
});

fs.renameSync(TMP, FILE);
console.log('patch522 written, ' + grew + ' bytes');
