/* A WEIGHT CARRIED ACROSS A MOVE OR A RENAME REACHES THE GROUP.

   A folder import that moves a file between status folders, or renames
   it, writes a new record and deletes the old one, and carryDecided gives
   the new record the old one's weight and shelf place. Inside a group the
   new record has already been uploaded by then - at the default weight,
   because it had none - and is marked synced. carryDecided wrote the
   carried values here only and left the record saying it matched the
   server: teammates saw weight 1, the status line said everything was
   sent, and this device's next pull put the server's 1 back over the
   carried weight (the repair path copies a synced record's weight from its
   row).

   It now does what setRarity does. The record is marked unsent the way
   unsentOf marks any change here - the path stays, so it is a weight-only
   change - and inside a group the row is patched at once, which marks it
   synced again when it lands. A patch that fails leaves it unsent for
   Save to cloud.

   And it reads the one record, not the whole store: it ran once per moved
   or merged trait, so forty traits changing folder read the project forty
   times. */
const path = require('path');
const fs = require('fs');
const kit = require(path.join(__dirname, '..', 'tools', 'patchkit.cjs'));

const FILE = path.join(__dirname, '..', 'index.html');
const TMP = FILE + '.new';
fs.copyFileSync(FILE, TMP);
const doc = kit.load(TMP);
const L = doc.lines;

const fn = kit.inFunction(L, 'async function carryDecided(from,toId){');
{
  const i = kit.only(L, l => l === '  try{ rec=(await dbAll()).find(i=>i.id===toId); }catch(_){ return false; }', 'the read', fn);
  kit.replace(L, { start: i, end: i }, ['  try{ rec=await dbGet(toId); }catch(_){ return false; }']);
}
{
  const i = kit.only(L, l => l === '  try{ await dbPut(rec); }catch(_){ return false; }', 'the write', fn);
  kit.replace(L, { start: i, end: i }, [
    '  /* NOT STILL SYNCED. Inside a group the import uploaded this record',
    '     before this ran, at the default weight, and marked it matching the',
    '     server; the carried values were then here only, and the next pull',
    '     put the row\'s back. Marked as any change here is, and sent now. */',
    '  const next=unsentOf(rec);',
    '  try{ await dbPut(next); }catch(_){ return false; }',
    '  if(activeWs && next.rowId && next.unsent==="meta"){ try{ await cloudPatchOne(next); }catch(_){} }',
  ]);
}

kit.save(doc, ({ code }) => {
  if (code.indexOf('rec=(await dbAll()).find(i=>i.id===toId)') >= 0) throw new Error('still reads the store');
});

fs.renameSync(TMP, FILE);
console.log('patch572 written');
